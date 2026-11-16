import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({
  options: {
    output: { type: "string", default: ".cache/evening-atlas-2026.mp4" },
    fps: { type: "string", default: "30" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "900" },
    start: { type: "string", default: "2026-01-01" },
    end: { type: "string", default: "2026-12-31" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(`Usage: npm run record:video -- [options]
  --output PATH   MP4 destination (default .cache/evening-atlas-2026.mp4)
  --fps NUMBER    Frames per second (default 30; 365 days = 12.17 seconds)
  --width NUMBER  Even pixel width, at least 800 (default 1280)
  --height NUMBER Even pixel height, at least 600 (default 900)
  --start DATE    First day, YYYY-MM-DD within 2026 (default 2026-01-01)
  --end DATE      Last day, inclusive (default 2026-12-31)

Requires FFmpeg and Chromium. Set FFMPEG_PATH or CHROMIUM_PATH if needed.
The output includes the map, legend, date, project name, and attribution.
Existing output files are never overwritten.`);
  process.exit(0);
}
const fps = Number(values.fps),
  width = Number(values.width),
  height = Number(values.height);
if (!Number.isFinite(fps) || fps < 1 || fps > 120)
  throw Error("FPS must be between 1 and 120.");
if (
  ![width, height].every((n) => Number.isInteger(n) && n % 2 === 0) ||
  width < 800 ||
  height < 600
)
  throw Error("Use even dimensions, at least 800 × 600.");
const parseDate = (date) => {
  const time = Date.parse(date + "T00:00:00Z");
  if (
    !/^2026-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== date
  )
    throw Error("Dates must be valid YYYY-MM-DD dates in 2026.");
  return time;
};
const start = parseDate(values.start),
  end = parseDate(values.end);
if (end < start) throw Error("End date must be on or after start date.");
const output = resolve(values.output);
if (!output.endsWith(".mp4")) throw Error("Output must end in .mp4.");
if (existsSync(output)) throw Error(`Output already exists: ${output}`);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
if (spawnSync(ffmpeg, ["-version"], { stdio: "ignore" }).status !== 0)
  throw Error("FFmpeg is required. Install it or set FFMPEG_PATH.");

let server, browser, temporary;
try {
  await mkdir(dirname(output), { recursive: true });
  temporary = await mkdtemp(resolve(dirname(output), ".atlas-recording-"));
  server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0, open: false },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    timezoneId: "UTC",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(
    () => document.querySelector("#map").dataset.date,
    {},
    { timeout: 60000 },
  );
  await page.addStyleTag({
    content: `
    #app { padding: 0 24px; max-width: none; }
    header { height: 56px; }
    #about-open, .reset-map, .map-hint, .date-controls, .scrubber { display: none; }
    main { gap: 12px; padding: 12px 0 18px; }
    .timeline { display: block; padding: 0; background: none; border: 0; text-align: center; }
    #recording-date { display: block; font-size: 24px; font-weight: 600; line-height: 1.4; }
    .band-scale > span { font-size: 15px; }
    * { animation: none !important; transition: none !important; }
  `,
  });
  // Let the app finish its debounced resize before fixing the camera.
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const { map } = await import(
      document.querySelector('script[src*="/src/main.js"]').src
    );
    window.recordingMap = map;
    map.stop();
    document
      .querySelector(".timeline")
      .append(
        Object.assign(document.createElement("time"), { id: "recording-date" }),
      );
    map.resize();
    map.fitBounds(
      [
        [-125, 24],
        [-66.5, 50],
      ],
      { padding: { top: 16, bottom: 28, left: 16, right: 16 }, duration: 0 },
    );
    await document.fonts.ready;
    await Promise.race([
      map.loaded()
        ? Promise.resolve()
        : new Promise((resolve) => map.once("idle", resolve)),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              Error(
                "Basemap did not finish loading. Check the network connection.",
              ),
            ),
          60000,
        ),
      ),
    ]);
  });
  const count = Math.round((end - start) / 86400000) + 1;
  console.log(
    `Capturing ${count} daily frames at ${width} × ${height} (${(count / fps).toFixed(2)} seconds at ${fps} fps).`,
  );
  for (let frame = 0; frame < count; frame++) {
    const date = new Date(start + frame * 86400000).toISOString().slice(0, 10);
    await page.evaluate(async (date) => {
      const map = window.recordingMap;
      const input = document.querySelector("#date-input");
      const rendered = new Promise((resolve) => map.once("render", resolve));
      input.value = date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const label = document.querySelector("#recording-date");
      label.dateTime = date;
      label.textContent = new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(date + "T12:00:00Z"));
      await Promise.race([
        rendered,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("Map render timed out.")), 10000),
        ),
      ]);
      await new Promise(requestAnimationFrame);
      if (document.querySelector("#map").dataset.date !== date)
        throw Error(`Map did not present ${date}.`);
    }, date);
    if (errors.length) throw Error(errors.join("\n"));
    await page.screenshot({
      path: resolve(temporary, `${String(frame).padStart(4, "0")}.png`),
      animations: "disabled",
    });
    if (frame % 30 === 0 || frame === count - 1)
      console.log(`Frame ${frame + 1}/${count}: ${date}`);
  }
  await browser.close();
  browser = null;
  console.log("Encoding H.264 MP4…");
  const encoded = resolve(temporary, "video.mp4");
  await new Promise((done, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-framerate",
        String(fps),
        "-start_number",
        "0",
        "-i",
        resolve(temporary, "%04d.png"),
        "-frames:v",
        String(count),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        encoded,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? done() : reject(Error(`FFmpeg exited with code ${code}.`)),
    );
  });
  await rename(encoded, output);
  console.log(`Saved ${output}`);
} finally {
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
