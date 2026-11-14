import { test, expect } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles" });

for (const [instant, date, dayIndex] of [
  ["2032-11-14T02:30:00Z", "2026-11-13", "316"],
  ["2031-01-01T02:30:00Z", "2026-12-31", "364"],
  ["2028-02-29T20:00:00Z", "2026-02-28", "58"],
  ["2028-03-01T20:00:00Z", "2026-03-01", "59"],
]) {
  test(`opens on local month/day ${date} when the clock is ${instant}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(instant));
    await page.goto("/");
    await expect(page.locator("#date-input")).toHaveValue(date);
    await expect(page.locator("#timeline")).toHaveValue(dayIndex);
    await expect(page.locator("#map")).toHaveAttribute("data-date", date, {
      timeout: 30000,
    });
  });
}
