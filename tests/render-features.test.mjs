import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import geojsonvt from "geojson-vt";
import { classifyRings } from "@maplibre/maplibre-gl-style-spec";
import { renderFeatures } from "../src/render-features.js";
const signedArea = (ring) =>
  ring.reduce((area, p, i) => {
    const q = ring[(i + ring.length - 1) % ring.length];
    return area + (q[0] - p[0]) * (p[1] + q[1]);
  }, 0);
function lostMainlands(tile) {
  let lost = 0;
  for (const f of tile?.features || []) {
    const largest = Math.max(...f.geometry.map((r) => Math.abs(signedArea(r))));
    if (largest < 2048) continue;
    const classified = classifyRings(
      f.geometry.map((r) => r.map(([x, y]) => ({ x, y }))),
      500,
    );
    const outer = Math.max(
      0,
      ...classified.map((p) =>
        Math.abs(signedArea(p[0].map((q) => [q.x, q.y]))),
      ),
    );
    if (outer < largest * 0.99) lost++;
  }
  return lost;
}
function tileIndex(features) {
  return geojsonvt(
    { type: "FeatureCollection", features },
    { extent: 8192, buffer: 2048, tolerance: 6, maxZoom: 18 },
  );
}
test("preserves genuine polygon holes and feature metadata when separating disconnected parts", () => {
  const outer = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    hole = [
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 2],
      [2, 2],
    ],
    island = [
      [20, 0],
      [21, 0],
      [21, 1],
      [20, 0],
    ];
  const feature = {
    type: "Feature",
    properties: { tzid: "America/Chicago", bucket: 5 },
    geometry: { type: "MultiPolygon", coordinates: [[outer, hole], [island]] },
  };
  const output = renderFeatures([feature]);
  assert.equal(output.length, 2);
  assert.deepEqual(output[0].geometry.coordinates, [outer, hole]);
  assert.deepEqual(output[1].geometry.coordinates, [island]);
  assert.ok(output.every((f) => f.properties === feature.properties));
  assert.equal(feature.geometry.type, "MultiPolygon");
});
test("reproduces the May 3 tile-winding bug and prevents the mainland becoming a hole", () => {
  const { features } = JSON.parse(
    gunzipSync(readFileSync("public/bands/2026-05-03.geojson.gz")),
  );
  assert.ok(
    lostMainlands(tileIndex(features).getTile(2, 1, 1)) > 0,
    "Raw MultiPolygon should reproduce the reported failure",
  );
  assert.equal(
    lostMainlands(tileIndex(renderFeatures(features)).getTile(2, 1, 1)),
    0,
  );
});
test("all 365 days retain their mainland exteriors through national and regional tiling", () => {
  const { dates } = JSON.parse(readFileSync("public/data/manifest.json"));
  for (const date of dates) {
    const { features } = JSON.parse(
      gunzipSync(readFileSync(`public/bands/${date}.geojson.gz`)),
    );
    const normalized = renderFeatures(features);
    assert.ok(normalized.every((f) => f.geometry.type === "Polygon"));
    const index = tileIndex(normalized);
    for (let z = 2; z <= 5; z++) {
      const n = 2 ** z,
        x0 = Math.floor((55 / 360) * n),
        x1 = Math.floor((114 / 360) * n);
      const merc = (lat) =>
        (1 -
          Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) /
        2;
      for (let x = x0; x <= x1; x++)
        for (
          let y = Math.floor(merc(50) * n);
          y <= Math.floor(merc(24) * n);
          y++
        )
          assert.equal(
            lostMainlands(index.getTile(z, x, y)),
            0,
            `${date} tile ${z}/${x}/${y}`,
          );
    }
  }
});
