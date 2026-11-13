import { gzipSync } from "node:zlib";
import { test, expect } from "@playwright/test";
test("renders, plays, scrubs without stale frames, handles missing and empty frames, fits mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  await expect(page.locator("[data-hour]")).toHaveCount(0);
  await expect(page.locator("#band-scale > span")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(page.locator("#date-input")).not.toHaveValue("2026-03-01");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.route("**/2026-01-02.geojson.gz*", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.locator("#timeline").fill("1");
  await page.locator("#timeline").fill("2");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-01-03");
  await page.waitForTimeout(1000);
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-01-03");
  await page.route("**/2026-12-01.geojson.gz*", (r) =>
    r.fulfill({ status: 503 }),
  );
  await page.locator("#date-input").fill("2026-12-01");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#status")).toContainText("couldn’t load");
  await page.route("**/2026-10-01.geojson.gz*", (r) =>
    r.fulfill({
      body: gzipSync(
        JSON.stringify({
          type: "FeatureCollection",
          bandSchema: 4,
          features: [],
        }),
      ),
    }),
  );
  await page.locator("#date-input").fill("2026-10-01");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#status")).toContainText("No sunset areas");
  await page.getByRole("button", { name: "About this map" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#date-input").fill("2026-06-21");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-06-21");
  await expect(page.locator("#status")).toBeEmpty();
  expect(
    +(await page.locator("#map").getAttribute("data-band-count")),
  ).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  await canvas.click({
    position: { x: box.width * 0.52, y: box.height * 0.48 },
  });
  await expect(page.locator(".maplibregl-popup-content strong")).toContainText(
    /PM/i,
    { timeout: 15000 },
  );
  await expect(page.locator(".maplibregl-popup-content")).toContainText(
    "America/",
  );
  await page.locator(".maplibregl-popup-close-button").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: ".cache/mobile-final.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: ".cache/desktop-final.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("iPhone-sized touch controls and map inspection", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  for (const selector of ["#play", "#previous", "#next", "#reset"]) {
    for (const element of await page.locator(selector).all()) {
      const box = await element.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(
    await page
      .locator("#date-input")
      .evaluate((e) => getComputedStyle(e).fontSize),
  ).toBe("16px");
  await page.locator("#next").tap();
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-03-02");
  const map = await page.locator("#map").boundingBox(),
    legend = await page.locator(".legend").boundingBox();
  expect(legend.y).toBeGreaterThanOrEqual(map.y + map.height);
  await page.screenshot({ path: ".cache/iphone-bands.png", fullPage: true });
  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 664],
    [390, 844],
    [430, 932],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth,
      ),
      `No scrolling at ${width}×${height}`,
    ).toBe(true);
    for (const selector of [
      "header",
      ".intro",
      ".map-shell",
      ".legend",
      ".timeline",
      "#play",
      "#date-input",
      "#timeline",
      "#speed",
    ]) {
      const element = page.locator(selector);
      if (!(await element.isVisible())) continue;
      const box = await element.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    const mapBox = await page.locator(".map-shell").boundingBox();
    expect(mapBox.width).toBeGreaterThanOrEqual(width - 24);
    expect(mapBox.height).toBeGreaterThan(120);
  }
  await context.close();
});
