import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "astronomy-engine";
import { Temporal } from "@js-temporal/polyfill";
import { curve, instant } from "../scripts/solar.mjs";
test("local evening can be the following UTC day", () =>
  assert.equal(
    instant("2026-01-15", "America/New_York", 21).toISOString(),
    "2026-01-16T02:00:00.000Z",
  ));
test("DST changes Denver but not Phoenix", () => {
  assert.equal(instant("2026-03-08", "America/Denver", 18).getUTCHours(), 0);
  assert.equal(instant("2026-03-08", "America/Phoenix", 18).getUTCHours(), 1);
  assert.equal(instant("2026-03-07", "America/Denver", 18).getUTCHours(), 1);
});
test("direct setting curve agrees with independent rise/set search within one minute", () => {
  for (const date of ["2026-03-20", "2026-06-21", "2026-12-21", "2026-11-01"])
    for (const tz of [
      "America/New_York",
      "America/Denver",
      "America/Phoenix",
    ]) {
      const target = instant(date, tz, 18);
      const pts = curve(target)[0];
      for (const [lon, lat] of pts.filter((_, i) => i % 60 === 0)) {
        const d = Temporal.PlainDate.from(date);
        const start = Temporal.ZonedDateTime.from({
          year: d.year,
          month: d.month,
          day: d.day,
          timeZone: tz,
          hour: 0,
        });
        const end = start.add({ days: 1 });
        const sunset = A.SearchRiseSet(
          A.Body.Sun,
          new A.Observer(lat, lon, 0),
          -1,
          new Date(start.epochMilliseconds),
          (end.epochMilliseconds - start.epochMilliseconds) / 86400000,
        );
        assert.ok(sunset);
        assert.ok(
          Math.abs(sunset.date - target) < 60000,
          `${date} ${tz} ${lat}: ${sunset.date - target}ms`,
        );
      }
    }
});
test("sampling resolution has negligible midpoint error", () => {
  for (const date of ["2026-03-20", "2026-06-21", "2026-12-21"]) {
    const t = instant(date, "America/Denver", 19);
    const coarse = curve(t, 0.1)[0],
      fine = curve(t, 0.025)[0];
    for (let i = 0; i < coarse.length - 1; i++) {
      const interpolated = (coarse[i][0] + coarse[i + 1][0]) / 2;
      assert.ok(Math.abs(interpolated - fine[i * 4 + 2][0]) < 0.0002);
    }
  }
});
