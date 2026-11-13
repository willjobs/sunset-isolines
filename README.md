# Evening Atlas — The shape of sunset

An interactive atlas of **local-clock sunset** across the contiguous United States, for every day of 2026. Six fixed filled bands show **before 5 pm, 5–6 pm, 6–7 pm, 7–8 pm, 8–9 pm, and 9 pm or later**. MapLibre + OpenFreeMap, Astronomy Engine, Temporal, and Shapely. No API key or application server required.

## Run

Node 24 and npm are recommended. Daily data is committed; Python and boundary downloads are only needed to regenerate it.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. `npm run build` produces `dist/`; `npm run preview` serves that production build. Vite uses relative paths so the app also works beneath a GitHub Pages repository subpath. Map styles/tiles and fonts require internet; the fonts have local fallbacks.

## Use

Choose a date, step with the arrows, or drag the year slider. Play advances by calendar day at the selected speed, wraps after December 31, and pauses when the tab is hidden. The initial date is March 1. All six bands remain visible, with a fixed dusk-to-daylight palette: muted purple for early sunsets, rising in brightness through rose, amber and gold to pale sunlight for 9 pm or later. There are no selectable cutoff lines.

Tap filled land for its modeled local sunset to the minute, IANA zone and UTC offset. The calculation uses the tapped coordinates and selected local calendar date, with the same fixed horizon altitude as the generator. Tap-to-inspect pauses playback; changing dates closes the previous popup.

The app fits its map, fixed legend, date/playback controls and year slider into the visible viewport using `100svh` and safe-area insets. At phone sizes the map stays within 10 px of each screen edge and expands into the space left by compact controls; there is no page scrolling. About opens a separately scrollable dialog. Controls retain 44 px touch targets, date text is 16 px to avoid iOS focus zoom, and direct map gestures support pinch zoom and pan. The reset button restores the national view.

The UI fetches a compressed daily frame and prefetches the next two. A 12-frame LRU cache bounds memory. Revision tokens prevent stale requests from replacing newer selections. Two GeoJSON sources prepare dates serially: the last complete frame stays visible while the other source loads and renders. Layers switch only after the new tiles are ready, and playback waits for presentation before scheduling another day. Failed loads keep the previous complete map visible with an error; valid empty frames are distinct. Gzip is decoded automatically by the host/browser where configured, or with the browser's native DecompressionStream (Safari 16.4+, modern Chromium/Firefox). Magic-byte detection handles both hosting behaviors.

## Reproduce the data

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run prepare:data
npm run generate
npm test
```

`prepare:data` downloads the **2025b land release** of Timezone Boundary Builder (~47 MB zipped) and US Atlas 3.0.1 Census state geometry, then verifies SHA-256 checksums. Generation first computes solar curves in Node and then intersects them with each zone polygon clipped to the lower-48 land mask. `scripts/bands.py` forms the regions east of each setting curve, differences successive regions into six disjoint buckets, and clips each bucket independently within each time zone. Shared time-zone edges are simplified once as a coverage at 0.002° for display; small Census/OSM coastal gaps are assigned to the nearest U.S. zone. It exports complete daily filled partitions, including clock-change edges at time-zone borders as deterministic gzip GeoJSON in `public/bands/`. Polygon holes, islands, and disconnected line parts survive geometric intersection. Large source files stay in ignored `.cache/`; exported frames and metadata live in `public/data/`. `public/states.geojson` provides subtle state boundaries.

For each local date, zone and cutoff, Temporal resolves the correct UTC instant, including next-day UTC and DST. Astronomy Engine supplies apparent equatorial coordinates of the Sun and sidereal time. The positive hour-angle solution at a fixed center altitude of −0.833333° gives the setting curve, sampled every 0.1° of latitude. Curves are cached by UTC instant and split at invalid intervals or the antimeridian before Shapely clipping. No interpolation bridges time zones or DST changes. A time-zone jump from 7:40 to 8:40 correctly separates the 7–8 pm and 8–9 pm bands.

The pinned geographic releases, runtime Node and tzdata versions, sampling, and horizon model are recorded in `public/data/manifest.json`. The npm lockfile and pinned Python requirements preserve dependencies. To reproduce the exact time-zone rules, use the recorded Node/ICU tzdata version (the generated set uses Node 24.22.1, tzdata 2026e). Boundaries represent the pinned release, not a promise of subsequent legislative changes. Atlas geometries are cartographically generalized; tiny coastal/border differences are possible.

The original line-only GeoJSON (approximately 4.3 MB for the year) remains in `public/data/` for reproducibility and solar validation. The app uses `public/bands/` gzip GeoJSON instead (roughly 150 KB per viewed date). Frames are independent and fetched on demand.

## Validate

`npm test` checks calendar coverage, geometry schema/bounds, DST and UTC rollover, sampling error against 0.025°, and independent `SearchRiseSet` agreement for raw and clipped points on equinoxes, solstices and both clock transitions. It derives the search window between local midnights, including 23/25-hour days. The one-minute tolerance accommodates the independent routines’ slightly different horizon models.

```sh
# A system Chromium is used by default; override if necessary.
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

The browser test starts Vite and checks rendered data, playback, delayed stale responses, failed and empty frames, the about dialog, tap inspection, gzip decoding, six fixed legend buckets, and full-screen mobile containment across six portrait/landscape viewport sizes. The March 7–8 regression checks actual pixels west of Chicago and farther south, rather than relying only on data coverage. External basemap access is required. Screenshots are saved to ignored `.cache/`.

The rendering regression can also run in Safari's engine (requires Playwright WebKit and its OS libraries):

```sh
npx playwright install webkit
BROWSER_ENGINE=webkit npm run test:browser -- --grep 'draws the Central'
```

`WEBKIT_EXECUTABLE_PATH` optionally selects a compatible custom WebKit launcher.

For full geometry and independent band classification validation after regeneration:

```sh
.venv/bin/python scripts/validate-bands.py
npm test
```

This verifies full land coverage without overlapping bands, checks Phoenix/Navajo/Hopi reference points, and prepares representative points checked against independent local sunset calculations. Without the local geographic inputs, the representative-point test is skipped; the complete committed calendar, schema and timezone calculation tests still run in CI.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` tests and builds on pushes to `main`, uploads `dist/`, then deploys with GitHub Pages. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. The expected URL is https://willjobs.com/sunset-isolines/. The workflow must have Pages permissions and the `github-pages` environment must permit the deployment. No generated build bundles need to be committed.

## Credits and licenses

Application code: MIT, see `LICENSE`. Derived contour database: ODbL 1.0, with Timezone Boundary Builder / OpenStreetMap attribution; see [`public/DATA-LICENSE.txt`](public/DATA-LICENSE.txt). US Atlas is ISC and its underlying U.S. Census data is public domain. Basemap attribution remains visible. Astronomy Engine is MIT. Terrain, elevation, and actual atmospheric conditions affect observed sunset; this map models a standard unobstructed sea-level horizon.

The original supplied specification is preserved in [`PLAN.md`](PLAN.md).
