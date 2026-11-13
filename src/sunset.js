import * as A from "astronomy-engine";
import { Temporal } from "@js-temporal/polyfill";
export function localSunset(date, tzid, lat, lon) {
  const d = Temporal.PlainDate.from(date);
  const start = Temporal.ZonedDateTime.from({
    year: d.year,
    month: d.month,
    day: d.day,
    timeZone: tzid,
    hour: 0,
  });
  const end = start.add({ days: 1 });
  const event = A.SearchAltitude(
    A.Body.Sun,
    new A.Observer(lat, lon, 0),
    -1,
    new Date(start.epochMilliseconds),
    (end.epochMilliseconds - start.epochMilliseconds) / 86400000,
    -0.833333,
  );
  if (!event) throw Error("No sunset on this date");
  return {
    time: event.date,
    label: event.date.toLocaleTimeString("en-US", {
      timeZone: tzid,
      hour: "numeric",
      minute: "2-digit",
    }),
    offset: event.date
      .toLocaleTimeString("en-US", {
        timeZone: tzid,
        timeZoneName: "shortOffset",
      })
      .split(" ")
      .at(-1),
  };
}
