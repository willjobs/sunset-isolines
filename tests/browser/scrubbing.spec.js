import { test, expect } from "@playwright/test";
test("scrubs the entire year offline without fetching days or rebuilding tiles", async ({
  page,
  context,
}) => {
  test.setTimeout(45000);
  const requests = [];
  page.on("request", (r) => {
    if (/\/(atlas|bands|data)\//.test(r.url())) requests.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  await expect(page.locator("#map")).toHaveAttribute("data-renderer", "gpu");
  await page.evaluate(async () => {
    const { map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    map.stop();
    if (!map.loaded()) await map.once("idle");
  });
  const before = requests.length;
  await context.setOffline(true);
  const result = await page.evaluate(async () => {
    const { map, atlas } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    let updates = 0;
    for (const id of ["states", "atlas-cities"]) {
      const source = map.getSource(id),
        old = source.setData.bind(source);
      source.setData = (...args) => {
        updates++;
        return old(...args);
      };
    }
    const slider = document.querySelector("#timeline");
    const durations = [],
      latencies = [];
    const presented = atlas.onPresented;
    atlas.onPresented = (day) => {
      latencies.push(atlas.lastPresentationMs);
      presented(day);
    };
    for (let i = 0; i < 120; i++) {
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      slider.value = String(Math.round((i * 364) / 119));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      durations.push(performance.now() - start);
    }
    for (let day = 0; day < 365; day++) {
      slider.value = String(day);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    atlas.onPresented = presented;
    const sorted = durations.toSorted((a, b) => a - b),
      lat = latencies.toSorted((a, b) => a - b);
    return {
      updates,
      handlerP95: sorted[Math.floor(sorted.length * 0.95)],
      presentationP95: lat[Math.floor(lat.length * 0.95)],
      frames: latencies.length,
      date: document.querySelector("#map").dataset.date,
    };
  });
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(result.date).toBe("2026-12-31");
  expect(result.updates).toBe(0);
  expect(requests.length).toBe(before);
  expect(requests.some((url) => url.includes("/bands/"))).toBe(false);
  expect(result.handlerP95).toBeLessThan(8);
  expect(result.frames).toBeGreaterThan(60);
  expect(result.presentationP95).toBeLessThan(100);
  console.log("GPU SCRUB BENCHMARK", JSON.stringify(result));
  await page.locator("#timeline").fill("0");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-01-01");
  await page.locator("#timeline").fill("364");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-12-31");
  await expect(page.locator("#status")).toBeEmpty();
});

test("GPU sampling stays correct without floating-point linear texture filtering", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      return name === "OES_texture_float_linear"
        ? null
        : original.call(this, name);
    };
  });
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  const linear = await page.evaluate(async () => {
    const { atlas, map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    map.stop();
    map.jumpTo({ center: [-98.5, 38.5], zoom: 2.05 });
    if (!map.loaded()) await map.once("idle");
    return atlas.linearSampling;
  });
  expect(linear).toBe(false);
  await page.locator("#date-input").fill("2026-05-25");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-05-25");
  const point = await page.evaluate(async () => {
    const { map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    const r = document.querySelector("#map").getBoundingClientRect(),
      p = map.project([-99, 47.481]);
    return { x: Math.floor(r.x + p.x), y: Math.floor(r.y + p.y) };
  });
  const { PNG } = await import("pngjs");
  const image = PNG.sync.read(await page.screenshot({ scale: "css" }));
  let matches = 0;
  for (let y = point.y - 1; y <= point.y + 1; y++)
    for (let x = point.x - 1; x <= point.x + 1; x++) {
      const i = (y * image.width + x) * 4;
      if ([255, 240, 173].every((v, c) => Math.abs(image.data[i + c] - v) <= 3))
        matches++;
    }
  expect(matches).toBeGreaterThanOrEqual(4);
});
