import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Temporal } from "@js-temporal/polyfill";
import { localSunset } from "../src/sunset.js";
test("fixed six-band scale and a complete compressed calendar", () => {
  const m = JSON.parse(readFileSync("public/data/manifest.json"));
  assert.deepEqual(m.bands.buckets, [
    "Before 5 pm",
    "5–6 pm",
    "6–7 pm",
    "7–8 pm",
    "8–9 pm",
    "9 pm or later",
  ]);
  assert.equal(m.bands.colors.length, 6);
  const luminance = (color) => {
    const rgb = color
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const lightness = m.bands.colors.map(luminance);
  assert.ok(
    lightness.every((v, i) => i === 0 || v > lightness[i - 1]),
    "Later sunset buckets must become brighter",
  );
  const states = JSON.parse(readFileSync("public/states.geojson"));
  assert.equal(states.features.length, 49);
  assert.ok(
    states.features.every(
      (f) => Number(f.id) <= 56 && !["02", "15"].includes(f.id),
    ),
  );
  const coordinates = (g) =>
    g.type === "Polygon" ? g.coordinates.flat() : g.coordinates.flat(2);
  for (const date of m.dates) {
    const frame = JSON.parse(
      gunzipSync(readFileSync(`public/bands/${date}.geojson.gz`)),
    );
    const bands = frame.features.filter((f) => f.properties.kind === "band");
    assert.ok(bands.length > 0);
    for (const f of bands) {
      assert.ok([0, 1, 2, 3, 4, 5].includes(f.properties.bucket));
      assert.ok(["Polygon", "MultiPolygon"].includes(f.geometry.type));
      for (const [lon, lat] of coordinates(f.geometry))
        assert.ok(lon >= -125 && lon <= -66 && lat >= 24 && lat <= 51);
    }
  }
});
test("tap calculation uses the selected local date, with correct Phoenix/Navajo summer offsets", () => {
  const a = localSunset("2026-06-21", "America/Phoenix", 33.448, -112.074);
  const b = localSunset("2026-06-21", "America/Denver", 35.681, -109.052);
  assert.equal(a.offset, "GMT-7");
  assert.equal(b.offset, "GMT-6");
  assert.match(a.label, /PM/);
});
test(
  "band representative points match independent sunset calculation",
  { skip: !existsSync(".cache/band-samples.json") },
  () => {
    for (const s of JSON.parse(readFileSync(".cache/band-samples.json"))) {
      const event = localSunset(s.date, s.tzid, s.lat, s.lon);
      const z = Temporal.Instant.fromEpochMilliseconds(
        event.time.getTime(),
      ).toZonedDateTimeISO(s.tzid);
      const hour = z.hour + z.minute / 60 + z.second / 3600;
      const expected =
        hour < 17
          ? 0
          : hour < 18
            ? 1
            : hour < 19
              ? 2
              : hour < 20
                ? 3
                : hour < 21
                  ? 4
                  : 5;
      assert.equal(s.bucket, expected, JSON.stringify({ ...s, hour }));
    }
  },
);
