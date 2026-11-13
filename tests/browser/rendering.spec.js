import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
test("draws the Central time band before presenting March 7–8", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-03-01",
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const { map } = await import("/src/main.js");
    map.stop();
    map.jumpTo({ center: [-98.5, 38.5], zoom: 2.05 });
    if (!map.loaded())
      await new Promise((resolve) => map.once("idle", resolve));
  });
  for (const [date, color] of [
    ["2026-03-07", [156, 113, 131]],
    ["2026-03-08", [200, 137, 125]],
    ["2026-03-07", [156, 113, 131]],
  ]) {
    await page.locator("#date-input").fill(date);
    await page.locator("#date-input").dispatchEvent("change");
    await expect(page.locator("#map")).toHaveAttribute("data-date", date, {
      timeout: 15000,
    });
    const points = await page.evaluate(async () => {
      const { map } = await import("/src/main.js");
      const rect = document.querySelector("#map").getBoundingClientRect();
      return [
        [-88.5, 41.5],
        [-88.8, 39.7],
        [-89, 36],
        [-89, 31],
      ].map((lnglat) => {
        const point = map.project(lnglat);
        return {
          x: Math.floor(rect.x + point.x) - 1,
          y: Math.floor(rect.y + point.y) - 1,
        };
      });
    });
    const image = PNG.sync.read(await page.screenshot({ scale: "css" }));
    for (const point of points) {
      let matches = 0;
      for (let y = point.y; y < point.y + 3; y++)
        for (let x = point.x; x < point.x + 3; x++) {
          const index = (y * image.width + x) * 4;
          if (color.every((v, c) => Math.abs(image.data[index + c] - v) <= 3))
            matches++;
        }
      expect(
        matches,
        `${date} at ${JSON.stringify(point)} must have the correct fill when presented`,
      ).toBeGreaterThanOrEqual(4);
    }
  }
});
