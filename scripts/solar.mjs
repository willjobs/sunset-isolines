import * as A from "astronomy-engine";
import { Temporal } from "@js-temporal/polyfill";
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
export const zones = [
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Chicago",
  "America/Indiana/Tell_City",
  "America/Indiana/Knox",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
];
export function instant(date, tzid, hour) {
  return new Date(
    Temporal.ZonedDateTime.from({
      year: +date.slice(0, 4),
      month: +date.slice(5, 7),
      day: +date.slice(8, 10),
      timeZone: tzid,
      hour,
    }).epochMilliseconds,
  );
}
export function curve(time, step = 0.1) {
  const v = A.GeoVector(A.Body.Sun, time, true);
  const eq = A.EquatorFromVector(A.RotateVector(A.Rotation_EQJ_EQD(time), v));
  const sidereal = A.SiderealTime(time);
  const rad = Math.PI / 180;
  const dec = eq.dec * rad;
  const lines = [];
  let line = [];
  for (let i = 0; i <= Math.round(27 / step); i++) {
    const lat = 24 + i * step;
    const phi = lat * rad;
    const x =
      (Math.sin(-0.833333 * rad) - Math.sin(phi) * Math.sin(dec)) /
      (Math.cos(phi) * Math.cos(dec));
    if (Math.abs(x) > 1 + 1e-12) {
      if (line.length > 1) lines.push(line);
      line = [];
      continue;
    }
    const angle = Math.acos(Math.max(-1, Math.min(1, x))) / rad;
    const lon = ((angle - 15 * (sidereal - eq.ra) + 540) % 360) - 180;
    if (line.length && Math.abs(lon - line.at(-1)[0]) > 180) {
      if (line.length > 1) lines.push(line);
      line = [];
    }
    line.push([+lon.toFixed(6), +lat.toFixed(6)]);
  }
  if (line.length > 1) lines.push(line);
  return lines;
}
export function frame(date, step = 0.1) {
  const cache = new Map();
  return zones.flatMap((tzid) =>
    [17, 18, 19, 20, 21].map((cutoffHour) => {
      const time = instant(date, tzid, cutoffHour);
      const key = time.toISOString();
      if (!cache.has(key)) cache.set(key, curve(time, step));
      return {
        type: "Feature",
        properties: { tzid, cutoffHour },
        geometry: { type: "MultiLineString", coordinates: cache.get(key) },
      };
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  mkdirSync(".cache", { recursive: true });
  let date = Temporal.PlainDate.from("2026-01-01");
  const frames = [];
  while (date.year === 2026) {
    const key = date.toString();
    frames.push({ date: key, features: frame(key) });
    date = date.add({ days: 1 });
  }
  writeFileSync(".cache/curves.json", JSON.stringify(frames));
  console.log(`Computed ${frames.length} daily solar frames`);
}
