import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
test("May regions stay filled and 9 pm sunsets keep the 9+ color during repeated date changes", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const { map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    map.stop();
    map.jumpTo({ center: [-98.5, 38.5], zoom: 2.05 });
    if (!map.loaded()) await map.once("idle");
  });
  const cases = [
    [
      "2026-05-03",
      [
        [-80, 35],
        [-83, 32],
      ],
      [239, 207, 130],
    ],
    [
      "2026-05-24",
      [
        [-99, 47.481],
        [-97.667, 48.152],
      ],
      [255, 240, 173],
    ],
    [
      "2026-05-25",
      [
        [-99, 47.481],
        [-97.667, 48.152],
      ],
      [255, 240, 173],
    ],
    [
      "2026-05-24",
      [
        [-99, 47.481],
        [-97.667, 48.152],
      ],
      [255, 240, 173],
    ],
    [
      "2026-05-25",
      [
        [-99, 47.481],
        [-97.667, 48.152],
      ],
      [255, 240, 173],
    ],
  ];
  for (const [date, locations, color] of cases) {
    await page.locator("#date-input").fill(date);
    await page.locator("#date-input").dispatchEvent("change");
    await expect(page.locator("#map")).toHaveAttribute("data-date", date, {
      timeout: 15000,
    });
    const points = await page.evaluate(async (locations) => {
      const { map } = await import(
        document.querySelector('script[src*="/src/main.js"]').src
      );
      const r = document.querySelector("#map").getBoundingClientRect();
      return locations.map((location) => {
        const p = map.project(location);
        return { x: Math.floor(r.x + p.x), y: Math.floor(r.y + p.y) };
      });
    }, locations);
    const image = PNG.sync.read(await page.screenshot({ scale: "css" }));
    for (const [i, p] of points.entries()) {
      let matches = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const offset = ((p.y + dy) * image.width + p.x + dx) * 4;
          if (color.every((v, c) => Math.abs(image.data[offset + c] - v) <= 3))
            matches++;
        }
      expect(
        matches,
        `${date} ${locations[i]} must show its actual sunset band`,
      ).toBeGreaterThanOrEqual(4);
    }
  }
});

test("rejects an incompatible atlas before displaying colors", async ({
  page,
}) => {
  await page.route("**/atlas/manifest.json", (route) =>
    route.fulfill({ json: { schema: 0, data: "old.bin.gz" } }),
  );
  await page.goto("/");
  await expect(page.locator("#status")).toContainText("couldn’t load");
  await expect(page.locator("#map")).not.toHaveAttribute("data-date", /./);
});
