import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Temporal } from "@js-temporal/polyfill";
import { decodeAtlas, zoneAt, bucketAt } from "../src/atlas-data.js";
import { localSunset } from "../src/sunset.js";
const manifest = JSON.parse(readFileSync("public/atlas/manifest.json")),
  raw = gunzipSync(readFileSync("public/atlas/" + manifest.data));
const buffer = raw.buffer.slice(
    raw.byteOffset,
    raw.byteOffset + raw.byteLength,
  ),
  data = decodeAtlas(buffer);
test("the compact atlas contains all dates and valid static triangles", () => {
  assert.equal(data.meta.dates[0], "2026-01-01");
  assert.equal(data.meta.dates.at(-1), "2026-12-31");
  assert.equal(data.meta.dates.length, 365);
  assert.ok(manifest.compressedBytes < 1_600_000);
  assert.ok(data.meta.maxQuantizationError < 0.0002);
  for (let i = 0; i < data.vertices.length; i += 3) {
    assert.ok(data.vertices[i] >= 0 && data.vertices[i] <= 1);
    assert.ok(data.vertices[i + 1] >= 0 && data.vertices[i + 1] <= 1);
    assert.ok(
      Number.isInteger(data.vertices[i + 2]) &&
        data.vertices[i + 2] < data.meta.zones.length,
    );
  }
  for (let i = 0; i < data.indices.length; i += 3) {
    const ids = [0, 1, 2].map(
      (j) => data.vertices[data.indices[i + j] * 3 + 2],
    );
    assert.ok(
      ids.every((z) => z === ids[0]),
      "Every triangle must belong to exactly one clock zone",
    );
  }
  assert.throws(() => decodeAtlas(buffer.slice(0, -10)), /atlas/i);
  assert.throws(() => decodeAtlas(new ArrayBuffer(8)), /atlas/i);
});
test("the mesh preserves Arizona exceptions, ordinary clock zones, and water holes", () => {
  for (const [lon, lat, tz] of [
    [-112.074, 33.448, "America/Phoenix"],
    [-109.052, 35.681, "America/Denver"],
    [-110.535, 35.835, "America/Phoenix"],
    [-87.63, 41.88, "America/Chicago"],
    [-73.97, 40.78, "America/New_York"],
  ]) {
    const z = zoneAt(data, lon, lat);
    assert.ok(z >= 0);
    assert.equal(data.meta.zones[z].tzid, tz);
  }
  assert.equal(zoneAt(data, -87, 43), -1);
  assert.equal(zoneAt(data, -122, 30), -1);
});
test("all days match independent local sunset calculations away from minute-scale model differences", () => {
  const sites = [
    [-122.33, 47.61],
    [-73.97, 40.78],
    [-104.99, 39.74],
    [-87.63, 41.88],
    [-112.074, 33.448],
    [-109.052, 35.681],
    [-110.535, 35.835],
    [-116.2, 43.61],
  ];
  let compared = 0;
  for (const [day, date] of data.meta.dates.entries())
    for (const [lon, lat] of sites) {
      const zone = zoneAt(data, lon, lat);
      assert.ok(zone >= 0, `${lon},${lat} must be on land`);
      const tz = data.meta.zones[zone].tzid;
      const sunset = localSunset(date, tz, lat, lon),
        z = Temporal.Instant.fromEpochMilliseconds(
          sunset.time.getTime(),
        ).toZonedDateTimeISO(tz),
        hour = z.hour + z.minute / 60 + z.second / 3600;
      if ([17, 18, 19, 20, 21].some((h) => Math.abs(hour - h) < 1 / 60))
        continue;
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
      assert.equal(
        bucketAt(data, day, zone, lon, lat),
        expected,
        `${date} ${tz} ${hour}`,
      );
      compared++;
    }
  assert.ok(compared > 2800);
});
