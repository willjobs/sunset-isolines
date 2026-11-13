import { defineConfig } from "@playwright/test";
const webkit = process.env.BROWSER_ENGINE === "webkit";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    browserName: webkit ? "webkit" : "chromium",
    baseURL: "http://localhost:5173",
    viewport: { width: 1440, height: 1050 },
    launchOptions: webkit
      ? process.env.WEBKIT_EXECUTABLE_PATH
        ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH }
        : {}
      : {
          executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
          args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
        },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
