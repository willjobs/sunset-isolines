import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import earcut, { flatten, deviation } from "earcut";
import * as A from "astronomy-engine";
import { Temporal } from "@js-temporal/polyfill";
const regions = JSON.parse(readFileSync(".cache/atlas-zones.geojson")).features;
const vertices = [],
  indices = [],
  zones = [];
const mercY = (lat) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
for (const [zoneIndex, feature] of regions.entries()) {
  const firstIndex = indices.length,
    bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  for (const polygon of polygons) {
    const projected = polygon.map((ring) =>
      ring.map(([lon, lat]) => [(lon + 180) / 360, mercY(lat)]),
    );
    const flat = flatten(projected),
      start = vertices.length / 3;
    for (let i = 0; i < flat.vertices.length; i += 2) {
      const x = flat.vertices[i],
        y = flat.vertices[i + 1];
      vertices.push(x, y, zoneIndex);
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    }
    const triangles = earcut(flat.vertices, flat.holes, 2);
    if (deviation(flat.vertices, flat.holes, 2, triangles) > 1e-7)
      throw Error("Incomplete time-zone triangulation");
    indices.push(...triangles.map((i) => start + i));
  }
  zones.push({
    tzid: feature.properties.tzid,
    firstIndex,
    indexCount: indices.length - firstIndex,
    bounds,
  });
}
const dates = [],
  latitudeCount = 271,
  instantCount = 9,
  curves = new Float32Array(365 * instantCount * latitudeCount),
  offsets = new Uint8Array(365 * zones.length);
let day = Temporal.PlainDate.from("2026-01-01");
const rad = Math.PI / 180;
for (let d = 0; d < 365; d++, day = day.add({ days: 1 })) {
  const date = day.toString();
  dates.push(date);
  for (let j = 0; j < instantCount; j++) {
    const time = new Date(Date.parse(date + "T00:00:00Z") + (21 + j) * 3600000);
    const eq = A.EquatorFromVector(
      A.RotateVector(
        A.Rotation_EQJ_EQD(time),
        A.GeoVector(A.Body.Sun, time, true),
      ),
    );
    const dec = eq.dec * rad,
      sidereal = A.SiderealTime(time);
    for (let k = 0; k < latitudeCount; k++) {
      const y = mercY(51) + (k * (mercY(24) - mercY(51))) / (latitudeCount - 1);
      const phi = Math.atan(Math.sinh(Math.PI * (1 - 2 * y))),
        x =
          (Math.sin(-0.833333 * rad) - Math.sin(phi) * Math.sin(dec)) /
          (Math.cos(phi) * Math.cos(dec));
      if (Math.abs(x) > 1) throw Error("Invalid lower-48 setting curve");
      let lon =
        ((Math.acos(x) / rad - 15 * (sidereal - eq.ra) + 540) % 360) - 180;
      if (lon > 0) lon -= 360;
      curves[d * instantCount * latitudeCount + j * latitudeCount + k] = lon;
    }
  }
  for (const [z, zone] of zones.entries()) {
    const instant = Temporal.ZonedDateTime.from({
      year: day.year,
      month: day.month,
      day: day.day,
      hour: 17,
      timeZone: zone.tzid,
    });
    const offset = -instant.offsetNanoseconds / 3.6e12;
    if (!Number.isInteger(offset) || offset < 4 || offset > 8)
      throw Error("Unsupported clock offset");
    offsets[d * zones.length + z] = offset - 4;
  }
}
const packed = new Uint16Array(curves.length),
  ranges = new Float32Array(365 * instantCount * 2);
let maxQuantizationError = 0;
for (let c = 0; c < 365 * instantCount; c++) {
  const line = curves.subarray(c * latitudeCount, (c + 1) * latitudeCount),
    min = Math.min(...line),
    max = Math.max(...line);
  ranges[c * 2] = min;
  ranges[c * 2 + 1] = (max - min) / 65535;
  for (let k = 0; k < latitudeCount; k++) {
    const value = Math.max(
      0,
      Math.min(
        65535,
        Math.round((line[k] - ranges[c * 2]) / ranges[c * 2 + 1]),
      ),
    );
    packed[c * latitudeCount + k] = value;
    maxQuantizationError = Math.max(
      maxQuantizationError,
      Math.abs(line[k] - (ranges[c * 2] + value * ranges[c * 2 + 1])),
    );
  }
}
const meta = {
  schema: 1,
  curveEncoding: "uint16-relative-mercator",
  maxQuantizationError,
  year: 2026,
  dates,
  zones,
  vertexCount: vertices.length / 3,
  indexCount: indices.length,
  latitudeCount,
  sampleYMin: mercY(51),
  sampleYStep: (mercY(24) - mercY(51)) / (latitudeCount - 1),
  instantCount,
  utcStartHour: 21,
  altitude: -0.833333,
  boundaryRelease: "2025b",
  node: process.version,
  tzdata: process.versions.tz,
};
const json = Buffer.from(JSON.stringify(meta)),
  header = Buffer.alloc(8 + Math.ceil(json.length / 4) * 4);
header.write("SSAT");
header.writeUInt32LE(json.length, 4);
json.copy(header, 8);
const raw = Buffer.concat([
  header,
  Buffer.from(new Float32Array(vertices).buffer),
  Buffer.from(new Uint32Array(indices).buffer),
  Buffer.from(packed.buffer),
  Buffer.alloc((4 - (packed.byteLength % 4)) % 4),
  Buffer.from(ranges.buffer),
  Buffer.from(offsets.buffer),
]);
const hash = createHash("sha256").update(raw).digest("hex"),
  data = `sunset-2026-${hash.slice(0, 16)}.bin.gz`,
  compressed = gzipSync(raw, { level: 9, mtime: 0 });
mkdirSync("public/atlas", { recursive: true });
writeFileSync("public/atlas/" + data, compressed);
writeFileSync(
  "public/atlas/manifest.json",
  JSON.stringify(
    {
      schema: 1,
      year: 2026,
      data,
      sha256: hash,
      compressedBytes: compressed.length,
      rawBytes: raw.length,
      model: {
        altitude: meta.altitude,
        samples: meta.latitudeCount,
        sampling: "uniform Mercator Y",
        maxLongitudeQuantizationError: meta.maxQuantizationError,
      },
      geometry: {
        vertices: meta.vertexCount,
        triangles: meta.indexCount / 3,
        boundaryRelease: meta.boundaryRelease,
      },
      runtime: { node: meta.node, tzdata: meta.tzdata },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${meta.vertexCount} vertices, ${indices.length / 3} triangles; ${compressed.length} compressed bytes for all 365 days`,
);
