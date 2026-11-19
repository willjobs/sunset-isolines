import { test, expect } from "@playwright/test";

test("fits the U.S. when the map grows before the first resize notification", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const observe = ResizeObserver.prototype.observe;
    ResizeObserver.prototype.observe = function (element, options) {
      if (element.id === "map" && !element.dataset.testResized) {
        // The canvas already has its initial size when observation begins.
        element.dataset.testResized = "yes";
        queueMicrotask(() => {
          element.parentElement.style.height = `${element.clientHeight + 160}px`;
        });
      }
      return observe.call(this, element, options);
    };
  });
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute("data-date", /^2026-/, {
    timeout: 30000,
  });
  const view = () =>
    page.evaluate(async () => {
      const { map } = await import(
        document.querySelector('script[src*="/src/main.js"]').src
      );
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const canvas = map.getCanvas();
      const nw = map.project([-125, 50]);
      const se = map.project([-66.5, 24]);
      return {
        canvasMatches:
          canvas.clientWidth === width && canvas.clientHeight === height,
        fitsUS: nw.x >= 0 && nw.y >= 0 && se.x <= width && se.y <= height,
        centered: Math.abs((nw.y + se.y) / 2 - height / 2) <= 12,
      };
    });
  const fitted = { canvasMatches: true, fitsUS: true, centered: true };
  await expect.poll(view).toEqual(fitted);
  await page.evaluate(async () => {
    const { map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    map.jumpTo({ center: [-140, 25], zoom: 5 });
  });
  await page.getByRole("button", { name: "Reset map view" }).click();
  await expect.poll(view).toEqual(fitted);
  await page.locator(".map-shell").evaluate((element) => {
    element.style.height = "";
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(view).toEqual(fitted);
});
