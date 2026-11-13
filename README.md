# Evening Atlas — The shape of sunset

An interactive atlas of 5, 6, 7, 8, and 9 pm **local-clock sunset** across the contiguous United States, for every day of 2026. MapLibre + OpenFreeMap, Astronomy Engine, Temporal, and Shapely. No API key or application server required.

## Run

Node 24 and npm are recommended. Daily data is committed; Python and boundary downloads are only needed to regenerate it.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. `npm run build` produces `dist/`; `npm run preview` serves that production build. Vite uses relative paths so the app also works beneath a GitHub Pages repository subpath. Map styles/tiles and fonts require internet; the fonts have local fallbacks.

## Use

Drag the timeline, choose a date, step a day with the arrows, or jump to an equinox or solstice. Play advances by calendar day at the selected pace, wrapping after December 31. Playback pauses when the tab is hidden. Click a contour for its time and zone. Zoom/pan and use the target button to return to the national view.

The UI requests the selected frame and prefetches the next five. A 32-frame LRU cache bounds memory. Revision tokens prevent stale requests from overwriting a newer selection; failed frames and valid empty frames have distinct states. Dates without a particular sunset cutoff simply omit that contour. The initial frame is the summer solstice, June 21.

## Reproduce the data

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run prepare:data
npm run generate
npm test
```

`prepare:data` downloads the **2025b land release** of Timezone Boundary Builder (~47 MB zipped) and US Atlas 3.0.1 Census state geometry, then verifies SHA-256 checksums. Generation first computes solar curves in Node and then intersects them with each zone polygon clipped to the lower-48 land mask. Polygon holes, islands, and disconnected line parts survive geometric intersection. Large source files stay in ignored `.cache/`; exported frames and metadata live in `public/data/`. `public/states.geojson` provides subtle state boundaries.

For each local date, zone and cutoff, Temporal resolves the correct UTC instant, including next-day UTC and DST. Astronomy Engine supplies apparent equatorial coordinates of the Sun and sidereal time. The positive hour-angle solution at a fixed center altitude of −0.833333° gives the setting curve, sampled every 0.1° of latitude. Curves are cached by UTC instant and split at invalid intervals or the antimeridian before Shapely clipping. No contour interpolation bridges time zones or DST changes.

The pinned geographic releases, runtime Node and tzdata versions, sampling, and horizon model are recorded in `public/data/manifest.json`. The npm lockfile and pinned Python requirements preserve dependencies. To reproduce the exact time-zone rules, use the recorded Node/ICU tzdata version (the generated set uses Node 24.22.1, tzdata 2026e). Boundaries represent the pinned release, not a promise of subsequent legislative changes. Atlas geometries are cartographically generalized; tiny coastal/border differences are possible.

The 365 uncompressed frames total approximately 4.3 MB; only viewed/prefetched frames are downloaded. Frames are deliberately kept as independent GeoJSON to preserve the source specification and transparent inspection.

## Validate

`npm test` checks calendar coverage, geometry schema/bounds, DST and UTC rollover, sampling error against 0.025°, and independent `SearchRiseSet` agreement for raw and clipped points on equinoxes, solstices and both clock transitions. It derives the search window between local midnights, including 23/25-hour days. The one-minute tolerance accommodates the independent routines’ slightly different horizon models.

```sh
# A system Chromium is used by default; override if necessary.
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

The browser test starts Vite and checks rendered data, playback, delayed stale responses, failed and empty frames, the about dialog, and mobile overflow. External basemap access is required. Screenshots are saved to ignored `.cache/`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` tests and builds on pushes to `main`, uploads `dist/`, then deploys with GitHub Pages. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. The expected URL is https://willjobs.github.io/sunset-isolines/. The workflow must have Pages permissions and the `github-pages` environment must permit the deployment. No generated build bundles need to be committed.

## Credits and licenses

Application code: MIT, see `LICENSE`. Derived contour database: ODbL 1.0, with Timezone Boundary Builder / OpenStreetMap attribution; see [`public/DATA-LICENSE.txt`](public/DATA-LICENSE.txt). US Atlas is ISC and its underlying U.S. Census data is public domain. Basemap attribution remains visible. Astronomy Engine is MIT. Terrain, elevation, and actual atmospheric conditions affect observed sunset; this map models a standard unobstructed sea-level horizon.

The original supplied specification is preserved in [`PLAN.md`](PLAN.md).
