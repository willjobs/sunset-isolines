import { test, expect } from "@playwright/test";
test("renders, plays, scrubs without stale frames, handles missing and empty frames, fits mobile", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute(
    "data-date",
    "2026-06-21",
    { timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(page.locator("#date-input")).not.toHaveValue("2026-06-21");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.route("**/2026-01-02.geojson", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.locator("#timeline").fill("1");
  await page.locator("#timeline").fill("2");
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-01-03");
  await page.waitForTimeout(1000);
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-01-03");
  await page.route("**/2026-12-01.geojson", (r) => r.fulfill({ status: 503 }));
  await page.locator("#date-input").fill("2026-12-01");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#status")).toContainText("couldn’t load");
  await page.route("**/2026-10-01.geojson", (r) =>
    r.fulfill({ json: { type: "FeatureCollection", features: [] } }),
  );
  await page.locator("#date-input").fill("2026-10-01");
  await page.locator("#date-input").dispatchEvent("change");
  await expect(page.locator("#status")).toContainText("No 5–9 pm");
  await page.getByRole("button", { name: "About this map" }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Summer solstice" }).click();
  await expect(page.locator("#map")).toHaveAttribute("data-date", "2026-06-21");
  await page.waitForTimeout(1000);
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
