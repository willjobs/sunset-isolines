# Evening Atlas

An interactive atlas of **local-clock sunset** across the contiguous United States, for every day of 2026. Six fixed bands show **before 5 pm, 5–6 pm, 6–7 pm, 7–8 pm, 8–9 pm, and 9 pm or later**. MapLibre + OpenFreeMap, Astronomy Engine, Temporal, and a GPU sunset layer. No API key or application server required.

## Run

Node 24 and npm are recommended. The complete atlas is committed; Python is only needed to regenerate data.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. `npm run build` produces `dist/`; `npm run preview` serves the production build. Relative paths support GitHub Pages repository subpaths. Styles, basemap tiles, and fonts require internet; fonts have local fallbacks.

## Use

Drag the year slider to scrub, choose a date, or step with the arrows. Play advances by calendar day at the selected pace, wraps after December 31, and pauses when the tab is hidden. The initial date uses the visitor's local month and day in the atlas's 2026 calendar; February 29 maps to February 28. The palette remains fixed, from dusk purple for early sunsets through rose, amber and gold to pale sunlight for 9 pm or later.

Tap land for its modeled local sunset to the minute, IANA zone and UTC offset. This uses the tapped coordinates and selected calendar date with the same fixed horizon model as the atlas. Tapping pauses playback; changing dates closes the previous popup.

The map, legend and controls fit the visible mobile viewport using `100svh` and safe-area insets. The map is within 10 px of each phone edge, buttons retain 44 px touch targets, and date text is 16 px to avoid iOS focus zoom. Pinch/pan the map; reset restores the national view. About opens a separately scrollable dialog.

## Record an MP4

Install [FFmpeg](https://ffmpeg.org/download.html) (`brew install ffmpeg` on macOS), then run:

```sh
npm ci
npx playwright install chromium
npm run record:video
```

The script starts its own local server, captures one frame per day from January 1 through December 31, and writes `.cache/evening-atlas-2026.mp4`. It waits for each date to render, so recording speed does not affect video timing. The default is a 1280 × 900 H.264 MP4 at 30 fps, about 12.17 seconds long. It includes the map, legend, date, branding, and basemap attribution, with playback controls hidden. Internet is needed for the basemap and fonts. The website itself is unchanged.

```sh
# A slower, approximately 24-second year
npm run record:video -- --fps 15 --output .cache/seasons-slow.mp4

# A short preview
npm run record:video -- --start 2026-01-01 --end 2026-01-03 --output .cache/preview.mp4

npm run record:video -- --help
```

Use `--width` and `--height` for other even dimensions (at least 800 × 600). Set `CHROMIUM_PATH` or `FFMPEG_PATH` to select installed executables; `/usr/bin/chromium` is used automatically when present. Output files are never overwritten. Temporary PNG frames are removed when the script finishes or reports an error.

## Instant scrubbing

A single **approximately 1.4 MB compressed** bundle contains the entire year. After this initial load, date changes require no downloads, GeoJSON parsing, triangulation, worker round trips, source updates, or tile rebuilding. Scrubbing still works with the network disabled.

The bundle contains a static land/time-zone triangle mesh, all dates' setting curves, and each zone's date-specific clock offset. Geometry and textures upload once. A date change updates a GPU uniform; MapLibre coalesces requests to its animation frame. When inputs arrive faster than drawing, the latest requested date is drawn directly, without a queue of stale days. The date marked as displayed changes in the draw callback.

Curves are sampled uniformly in Mercator Y, allowing a fragment to find its north–south sample without expensive inverse-projection math. Data is packed with per-curve 16-bit quantization for download, then expanded once into a floating-point GPU texture. The vertex shader selects the clock offset, and the fragment shader compares each point with five hourly thresholds to choose one of six fixed colors. Hardware linear sampling is used when available, with equivalent manual interpolation otherwise.

The mesh is triangulated once, offline, from independent polygons with their genuine holes. No daily polygon is simplified or classified by the map's tiler. This removes the earlier failure where a tiny island's rounded winding could cause an unrelated mainland region to be interpreted as a hole.

The atlas manifest is revalidated; the binary asset has a content-hashed URL and a verified SHA-256 checksum where SubtleCrypto is available. Format validation rejects incompatible data. Older cached five-band GeoJSON cannot enter this rendering path. Gzip may be decoded by the host/browser or by DecompressionStream (Safari 16.4+, modern Chromium/Firefox).

Input handling is a fraction of a millisecond in the headless benchmark. Actual display cadence depends on the browser, GPU, basemap and viewport resolution; the app requests the next available frame rather than promising a fixed frame rate on every device. The test machine uses software graphics.

## Reproduce the GPU atlas

The committed reference frame already contains the pinned, validated land/time-zone partition. Rebuild the compact atlas without downloading boundaries or regenerating 365 GeoJSON files:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run generate:atlas
npm test
```

`scripts/atlas-zones.py` unions the reference frame's hourly bands by zone, recovering the fixed land/time-zone polygons. `scripts/build-atlas.mjs` triangulates them with Earcut, verifies triangulated areas, and computes the curve/clock tables with Astronomy Engine and Temporal. It emits a deterministic gzip binary and manifest in `public/atlas/`. SHA-256 names change whenever data changes. Old content-hashed assets can remain available for previously cached manifests.

The current mesh has 21,187 vertices and 20,829 triangles. Nine UTC instants per calendar date cover all 5–9 pm local cutoffs across the lower 48. Each instant has 271 north–south samples over 24–51° latitude. Zone offsets are looked up independently for each local date, preserving spring/fall clock jumps, Phoenix, Navajo and Hopi rules. There is no interpolation across dates or zones.

Curve coordinates are quantized relative to each curve's own range. The maximum recorded longitude quantization error is below 0.0002° (less than 0.05 seconds of solar clock time). Sampling interpolation and the horizon model have their own small errors; numerical tests use a one-minute agreement target against independent sunset searches. Shared time-zone edges retain the source's 0.002° display simplification. The mesh uses float coordinates for drawing; coastal detail is cartographically generalized.

The manifest records bundle size, hash, geometry, model, Node and tzdata versions. Reproduce the exact clock rules with the recorded Node/ICU tzdata version, npm lockfile and pinned Python requirements. The generated set uses Node 24.22.1 and tzdata 2026e.

## Reproduce the reference GeoJSON

The original line frames remain in `public/data/`; filled frames remain in `public/bands/` as numerical/geographic reference artifacts. The frontend does not request them. For a full regeneration from pinned source releases:

```sh
npm run prepare:data
npm run generate
.venv/bin/python scripts/validate-bands.py
npm test
```

`prepare:data` downloads Timezone Boundary Builder **2025b** (~47 MB zipped) and US Atlas **3.0.1**, verifying SHA-256 checksums. Node computes geocentric apparent solar position and the positive setting hour angle at a fixed solar-center altitude of **−0.833333°**. Temporal converts each local cutoff to its correct UTC instant, including next-day UTC and DST. Shapely clips curves and bands to land/time zones, retaining holes and disconnected pieces. Small Census/OSM coastal gaps are assigned to the nearest U.S. zone. Original geographic inputs stay in ignored `.cache/`.

## Validate

`npm test` verifies the compact binary and triangle indexing, land/clock-zone picks (including water holes and Arizona exceptions), and more than 2,800 city/date classifications across the entire year against independent sunset calculations. The archived line/band tests verify calendar completeness, bounds, next-day UTC, DST, sampling, and rise/set agreement.

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Browser checks cover play/pause, rapid scrubbing, exact-time popups, six phone portrait/landscape sizes without scrolling, incompatible atlas responses, and real pixel colors on March 7–8, May 3 and May 24–25. The offline scrub benchmark verifies zero date-file requests and zero source updates, runs animation-frame-paced inputs and an all-365-date burst, reports p95 handler/presentation latency, and checks that the latest date wins. It also tests the manual texture-filtering fallback.

Run in Safari's WebKit engine (requires Playwright WebKit and its OS libraries):

```sh
npx playwright install webkit
BROWSER_ENGINE=webkit npm run test:browser
```

`WEBKIT_EXECUTABLE_PATH` optionally selects a custom compatible launcher. The tests import the actual Vite entry URL, including its HMR version, so they inspect the existing map rather than accidentally starting a second instance. Screenshots stay in ignored `.cache/`.

## GitHub Pages

The workflow tests and builds on pushes to `main`, uploads `dist/`, and deploys with GitHub Pages. Select **GitHub Actions** in repository **Settings → Pages**. The public URL is https://willjobs.com/evening-atlas/. No compiled bundles need to be committed.

## Credits and licenses

Application code: MIT (`LICENSE`). Derived geographic data and mesh: ODbL 1.0, with Timezone Boundary Builder / OpenStreetMap attribution (`public/DATA-LICENSE.txt`). US Atlas is ISC; underlying U.S. Census data is public domain. Basemap attribution remains visible. Astronomy Engine is MIT. Terrain, elevation and actual atmospheric conditions affect observed sunset; this map models a standard unobstructed sea-level horizon.

The supplied specification is preserved in `PLAN.md`.
