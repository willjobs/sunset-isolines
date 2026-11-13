# U.S. sunset contours — implementation plan

Build a static, interactive map of where the Sun sets at **5, 6, 7, 8, and 9 p.m. local time** on a selected date. Start with the contiguous U.S. and one calendar year. Use **Astronomy Engine** for the solar calculations, **MapLibre GL JS** with **OpenFreeMap Positron** for the basemap, and **GitHub Pages** for the app and generated data. A date slider and play/pause control are enough for the first release.

## 1. Define what each line means

A 6 p.m. contour connects locations with a modeled sunset at 6:00 p.m. on the selected **local calendar date**. A contour can end at a coast or time-zone boundary, resume elsewhere, or be entirely absent that day. Keep each segment in the zone whose clock defines it. At a boundary, two nearby locations can differ by an hour on the clock. Draw the actual contour segments and let the break show.

Use the standard apparent-sunset convention of the Sun’s center **0.833° below a level horizon**, assuming standard refraction and an unobstructed sea-level horizon. This gives consistent national coverage. Terrain and local atmospheric conditions affect the sunset a person sees.

References — [U.S. Naval Observatory sunset definition](https://aa.usno.navy.mil/faq/RST_defs), [NOAA calculation details](https://gml.noaa.gov/grad/solcalc/calcdetails.html).

## 2. Prepare the boundaries and clock rules

- Download a pinned, current-rules land release of **Timezone Boundary Builder**. Use its IANA zone IDs and retain polygon holes and disconnected parts. Intersect the time-zone coverage with a contiguous-U.S. land mask. Use a published Census or US Atlas geometry for the mask and check the resulting coastal and border coverage. Prepare these polygons once for all frames.
- Treat each date as a calendar date without a time zone until you combine it with a cutoff and a polygon’s zone ID. In the Node build script, use `Temporal.ZonedDateTime.from({ timeZone, year, month, day, hour })` with a compatible runtime or `@js-temporal/polyfill`. Pass `new Date(zonedDateTime.epochMilliseconds)` to Astronomy Engine. For example, 9 p.m. Eastern in standard time is 02:00 UTC **the next day**.
- Use the actual offset for that local date and hour. Most of Arizona and the Navajo Nation provide a useful test of where the summer clock rules differ. Record the boundary release, Node version, time-zone data version if available, and npm lockfile so the frames can be regenerated. Keep attribution and license notices for the inputs you redistribute. Review the boundary dataset’s ODbL terms when publishing the generated data.

References — [Timezone Boundary Builder releases](https://github.com/evansiroky/timezone-boundary-builder/releases), [boundary data license](https://github.com/evansiroky/timezone-boundary-builder/blob/main/DATA_LICENSE), [US Atlas](https://github.com/topojson/us-atlas), [Temporal.ZonedDateTime.from](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/from), [Arizona daylight-saving rules](https://www.library.pima.gov/content/daylight-saving-time-tucson-and-arizona/).

## 3. Compute the contours with Astronomy Engine

Use the npm package `astronomy-engine`, which is the JavaScript library distributed as `astronomy.js`. For a given UTC instant, find the evening locations where the Sun reaches the sunset altitude. This gives you the curve directly with one calculation of the Sun’s position per distinct instant.

1. Compute `GeoVector(Body.Sun, instant, true)`, rotate it with `RotateVector(Rotation_EQJ_EQD(instant), vector)`, then use `EquatorFromVector()` to get right ascension `raHours` and declination `decDeg`. Get Greenwich apparent sidereal time with `SiderealTime(instant)`.
2. At each sampled latitude, solve the altitude equation for the **positive** local hour angle, which gives the setting branch. The longitude is east-positive. Use radians inside the trig functions and convert the right ascension and sidereal time from hours to degrees.

   ```text
   h = radians(-0.833333)
   φ = radians(latitudeDeg)
   δ = radians(decDeg)

   x = (sin(h) - sin(φ) * sin(δ)) / (cos(φ) * cos(δ))
   hourAngleDeg = degrees(acos(x))
   longitudeDeg = wrapTo180(hourAngleDeg - 15 * (siderealHours - raHours))
   ```

   Where `x` is outside [−1, 1], the altitude has no solution at that latitude. Allow a tiny floating-point tolerance at the endpoints. End the current line segment at an invalid interval and split at the antimeridian before planar clipping if a sampled curve wraps there.
3. Sample every **0.1° of latitude** over the lower 48, or about 250 points per curve before clipping. Cache the uncut curve by UTC instant within each frame. For example, 5 p.m. Central and 6 p.m. Eastern can use the same curve when the two cutoffs convert to the same instant.
4. Intersect the line geometry with each matching zone polygon. A Python preprocessing script using **Shapely** is a practical way to do the clipping alongside a Node astronomy script. Use an actual line–polygon intersection so a narrow polygon can capture a crossing even when both neighboring sample points fall outside it. Preserve each resulting line segment and discard point-only touches.

References — [Astronomy Engine JavaScript API](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md), [USNO altitude and hour-angle equations](https://aa.usno.navy.mil/faq/alt_az), [Shapely intersection](https://shapely.readthedocs.io/en/stable/reference/shapely.intersection.html).

## 4. Export and display one frame per day

Write one GeoJSON FeatureCollection per local date, named `YYYY-MM-DD.geojson`. Store line features with a numeric `cutoffHour` (17–21) and the IANA `tzid`. Keep coordinates in `[longitude, latitude]` order. Add a small manifest of available dates. An empty collection is a valid frame. Measure representative frame sizes before deciding whether simplification or batching is worthwhile.

Initialize MapLibre with OpenFreeMap’s Positron style at `https://tiles.openfreemap.org/styles/positron`. Fit the initial view to the lower 48. After the style loads, add one GeoJSON source and a line layer styled by `cutoffHour`. Give the contours a light casing for contrast over roads and place the contour layers below the basemap labels where the style permits. Keep MapLibre’s attribution visible and use a compact legend for the five cutoff times.

When the user changes the date, fetch that frame and call `setData()` on the existing source. Fetch the next few frames ahead of playback and keep a bounded cache. Cancel or ignore stale requests when the user scrubs quickly so a slow response cannot replace a newer date. During playback, advance in calendar-day steps. The spring and fall clock changes should appear as jumps on the affected dates. Show a loading or error state if a frame is unavailable, distinct from a valid empty frame.

References — [OpenFreeMap quick start](https://openfreemap.org/quick_start/), [OpenFreeMap attribution](https://openfreemap.org/#attribution), [MapLibre GeoJSON source](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/).

## 5. Validate a few dates before generating the year

| Check | What to verify |
| --- | --- |
| Solstices and an equinox | Curves shift seasonally. Cutoffs outside the day’s modeled range disappear. |
| Spring and fall clock changes | Compare dates immediately before and after each change. Observe the jump in DST-observing areas and ordinary day-to-day movement in most of Arizona. |
| Time-zone boundaries | Segments end at the correct boundary. Inspect the Navajo Nation and the Hopi area and check at least one ordinary interstate boundary. |
| Astronomy | Pick vertices and segment midpoints. Run `SearchRiseSet(Body.Sun, new Observer(lat, lon, 0), -1, start, limitDays)` over the local calendar day and compare its UTC result with the cutoff instant. Start with a one-minute agreement target for the lower 48. |
| Geometry resolution | Compare a handful of frames at 0.1° and 0.025°. Keep 0.1° if differences are negligible at the intended zoom and near important boundaries. |
| Browser behavior | Scrub rapidly, run playback, resize to mobile, and confirm attribution, loading states, and deployed file URLs. |

Start the `SearchRiseSet` window at local midnight and derive its duration from the next local midnight. That handles 23- and 25-hour DST dates. The direct curve uses a fixed standard altitude. The library’s rise/set routine uses the Sun’s apparent radius and a standard refraction correction, so small differences are expected. Tighten sampling if the error comes from line interpolation. A finer line cannot fix differences caused by the horizon model.

Reference — [Astronomy Engine SearchRiseSet documentation](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md#searchrisesetbody-observer-direction-datestart-limitdays-metersaboveground--astrotime--null).

## 6. Deploy as a static site

Use a public GitHub repo and enable **GitHub Pages**. For a simple first version, publish the `docs/` folder from the main branch. Put the built frontend, manifest, and GeoJSON frames there. Use relative URLs or set the bundler’s base path to the repository subpath so frames still load at `username.github.io/repository/`. If you use a GitHub Actions build instead, upload the same static output as the Pages artifact.

The app and contour data are served by GitHub Pages. OpenFreeMap serves the Positron style and the tiles needed for the current view, with no basemap download to commit and no API key. The data generator runs locally or at build time. Visitors only download the app and the frames they view.

**Build order:** Generate a handful of test frames, render one in Positron, add the date slider and playback, then generate and publish the full year once the boundary and clock-change checks pass.

References — [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [OpenFreeMap public instance](https://openfreemap.org/).
