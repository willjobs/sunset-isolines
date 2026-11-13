import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { createFramePresenter } from "./frame-presenter.js";
const $ = (id) => document.getElementById(id);
const bandColors = [
  "#6d587a",
  "#9c7183",
  "#c8897d",
  "#dfab75",
  "#efcf82",
  "#fff0ad",
];
const bandLabels = ["Before 5", "5–6", "6–7", "7–8", "8–9", "9+"];
$("band-scale").innerHTML = bandLabels
  .map(
    (label, i) =>
      `<span aria-label="${i === 5 ? "9 pm or later" : i === 0 ? "Before 5 pm" : label + " pm"}"><i style="background:${bandColors[i]}"></i>${label}</span>`,
  )
  .join("");
let activePopup;
const bandSlots = [
  { source: "bands", layer: "sunset-bands" },
  { source: "bands-next", layer: "sunset-bands-next" },
];
let activeSlot = 0;
function sourceReady(sourceId) {
  return new Promise((resolve) => {
    const check = () => {
      if (map.isSourceLoaded(sourceId)) {
        map.off("sourcedata", check);
        resolve();
      }
    };
    map.on("sourcedata", check);
    check();
  });
}
const presentFrame = createFramePresenter(
  async (frame) => {
    const bands = frame.features.filter((f) => f.properties.kind === "band");
    const nextSlot = 1 - activeSlot;
    const { source } = bandSlots[nextSlot];
    await map
      .getSource(source)
      .setData({ type: "FeatureCollection", features: bands }, true);
    await sourceReady(source);
    // Let the render loop upload the prepared tiles before revealing them.
    await new Promise((resolve) => {
      map.once("render", resolve);
      map.triggerRepaint();
    });
    return { nextSlot, bands, date: frame.date };
  },
  async ({ nextSlot, bands, date }) => {
    map.setPaintProperty(bandSlots[activeSlot].layer, "fill-opacity", 0);
    map.setPaintProperty(bandSlots[nextSlot].layer, "fill-opacity", 1);
    activeSlot = nextSlot;
    await new Promise((resolve) => {
      map.once("render", resolve);
      map.triggerRepaint();
    });
    await new Promise(requestAnimationFrame);
    displayed = dates.indexOf(date);
    $("map").dataset.date = date;
    $("map").dataset.bandCount = String(bands.length);
  },
);
$("months").innerHTML = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
  .map((m) => `<span>${m}</span>`)
  .join("");
const base = import.meta.env.BASE_URL;
let dates = [],
  index = 59,
  displayed = -1,
  revision = 0,
  playing = false,
  timer,
  ready = false;
const cache = new Map(),
  pending = new Map();
const status = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
const empty = { type: "FeatureCollection", features: [] };
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  center: [-98.5, 38.5],
  zoom: 3.4,
  minZoom: 2,
  maxZoom: 9,
  renderWorldCopies: false,
  attributionControl: { compact: true },
  fadeDuration: 200,
  cooperativeGestures: false,
});
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
const fit = () =>
  map.fitBounds(
    [
      [-125, 24],
      [-66.5, 50],
    ],
    {
      padding: { top: 12, bottom: 28, left: 10, right: 10 },
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 900,
    },
  );
let resizeTimer;
map.on("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (ready)
      map.fitBounds(
        [
          [-125, 24],
          [-66.5, 50],
        ],
        { padding: { top: 12, bottom: 28, left: 10, right: 10 }, duration: 0 },
      );
  }, 150);
});
$("reset").onclick = fit;
map.on("error", (e) => {
  if (!ready)
    status(
      "The basemap could not load. Check your connection and reload.",
      true,
    );
  console.warn("Map resource:", e.error?.message);
});
map.on("load", () => {
  for (const l of map.getStyle().layers) {
    if (l.type === "background")
      map.setPaintProperty(l.id, "background-color", "#eef0e5");
    if (l.type === "fill" && /water/i.test(l.id))
      map.setPaintProperty(l.id, "fill-color", "#cddfdd");
    if (l.type === "fill" && /park|landcover|landuse/i.test(l.id))
      map.setPaintProperty(l.id, "fill-opacity", 0.35);
  }
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  for (const { source, layer } of bandSlots) {
    map.addSource(source, { type: "geojson", data: empty });
    map.addLayer(
      {
        id: layer,
        type: "fill",
        source,
        paint: {
          "fill-color": [
            "match",
            ["get", "bucket"],
            ...bandColors.flatMap((c, i) => [i, c]),
            "#ccc",
          ],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 0, delay: 0 },
          "fill-antialias": false,
        },
      },
      firstLabel,
    );
  }
  map.addSource("states", { type: "geojson", data: `${base}states.geojson` });
  map.addLayer({
    id: "state-boundaries",
    type: "line",
    source: "states",
    paint: { "line-color": "#859b8b", "line-width": 0.6, "line-opacity": 0.4 },
  });
  const cities = [
    ["Seattle", -122.33, 47.61],
    ["San Francisco", -122.42, 37.77],
    ["Los Angeles", -118.24, 34.05],
    ["Denver", -104.99, 39.74],
    ["Dallas", -96.8, 32.78],
    ["Chicago", -87.63, 41.88],
    ["Atlanta", -84.39, 33.75],
    ["Miami", -80.19, 25.76],
    ["New York", -74.01, 40.71],
  ];
  map.addSource("atlas-cities", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: cities.map(([name, lon, lat]) => ({
        type: "Feature",
        properties: { name },
        geometry: { type: "Point", coordinates: [lon, lat] },
      })),
    },
  });
  map.addLayer({
    id: "atlas-city-dots",
    type: "circle",
    source: "atlas-cities",
    maxzoom: 5,
    paint: {
      "circle-radius": 2,
      "circle-color": "#253a3a",
      "circle-stroke-color": "#fffdf2",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: "atlas-city-labels",
    type: "symbol",
    source: "atlas-cities",
    maxzoom: 5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 4, 12],
      "text-anchor": "left",
      "text-offset": [0.5, 0],
      "text-padding": 3,
    },
    paint: {
      "text-color": "#253a3a",
      "text-halo-color": "#fffdf2",
      "text-halo-width": 1.5,
    },
  });
  map.on(
    "mouseenter",
    bandSlots.map((s) => s.layer),
    () => (map.getCanvas().style.cursor = "crosshair"),
  );
  map.on(
    "mouseleave",
    bandSlots.map((s) => s.layer),
    () => (map.getCanvas().style.cursor = ""),
  );
  map.on(
    "click",
    bandSlots.map((s) => s.layer),
    async (e) => {
      const f = e.features.find(
        (f) => f.layer.id === bandSlots[activeSlot].layer,
      );
      if (!f || displayed < 0) return;
      pause();
      activePopup?.remove();
      const date = dates[displayed],
        tz = f.properties.tzid;
      const popup = new maplibregl.Popup({
        closeButton: true,
        maxWidth: "290px",
      })
        .setLngLat(e.lngLat)
        .setHTML("<p>Calculating local sunset…</p>")
        .addTo(map);
      activePopup = popup;
      try {
        const { localSunset } = await import("./sunset.js");
        const sunset = localSunset(date, tz, e.lngLat.lat, e.lngLat.lng);
        if (activePopup !== popup || dates[displayed] !== date) return;
        popup.setHTML(
          `<span>LOCAL SUNSET · ${new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span><strong>${sunset.label}</strong><p>${tz.replaceAll("_", " ")} · ${sunset.offset}</p><span>${e.lngLat.lat.toFixed(3)}°, ${e.lngLat.lng.toFixed(3)}° · Modeled horizon</span>`,
        );
      } catch {
        if (activePopup === popup)
          popup.setHTML(
            "<p>Sunset could not be calculated. Please try again.</p>",
          );
      }
    },
  );
  ready = true;
  fit();
  if (dates.length) show(index);
});
function fetchFrame(i) {
  const key = dates[i];
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return Promise.resolve(value);
  }
  if (pending.has(key)) return pending.get(key);
  const p = fetch(`${base}bands/${key}.geojson.gz`)
    .then((r) => {
      if (!r.ok) throw Error(`Frame ${key}: ${r.status}`);
      return r.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        // Some hosts set Content-Encoding and the browser decompresses first.
        if (bytes[0] === 0x1f && bytes[1] === 0x8b)
          return new Response(
            new Blob([buffer])
              .stream()
              .pipeThrough(new DecompressionStream("gzip")),
          ).json();
        return JSON.parse(new TextDecoder().decode(bytes));
      });
    })
    .then((data) => {
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features))
        throw Error("Invalid frame");
      cache.set(key, data);
      while (cache.size > 12) cache.delete(cache.keys().next().value);
      return data;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
function updateDate() {
  const key = dates[index];
  const d = new Date(key + "T12:00:00Z");
  $("timeline").value = index;
  $("timeline").setAttribute(
    "aria-valuetext",
    d.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" }),
  );
  $("date-input").value = key;
}
async function show(i) {
  if (!dates.length) return false;
  index = (i + dates.length) % dates.length;
  updateDate();
  const token = ++revision;
  if (!ready) {
    status("Loading the basemap…");
    return false;
  }
  if (!cache.has(dates[index])) status("Finding the evening…");
  try {
    const frame = await fetchFrame(index);
    if (token !== revision) return false;
    activePopup?.remove();
    activePopup = null;
    status("Drawing the evening…");
    if (
      !(await presentFrame(
        { ...frame, date: dates[index] },
        () => token === revision,
      ))
    )
      return false;
    status(
      frame.features.length ? "" : "No sunset areas available on this date.",
    );
    for (let n = 1; n <= 2; n++)
      fetchFrame((index + n) % dates.length).catch(() => {});
    return true;
  } catch (e) {
    if (token === revision) {
      activePopup?.remove();
      activePopup = null;
      // Keep the previous complete frame visible if a replacement fails.
      // Its data-date continues to identify the day actually on the map.
      status("This evening couldn’t load. Choose another date or retry.", true);
      pause();
    }
    return false;
  }
}
function pause() {
  playing = false;
  clearTimeout(timer);
  $("play").setAttribute("aria-label", "Play animation");
  $("play").setAttribute("aria-pressed", "false");
  $("play").innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
}
async function tick() {
  if (!playing) return;
  await show(index + 1);
  if (playing) timer = setTimeout(tick, +$("speed").value);
}
$("play").onclick = async () => {
  if (playing) {
    pause();
    return;
  }
  if (!ready || !dates.length) return;
  playing = true;
  $("play").setAttribute("aria-label", "Pause animation");
  $("play").setAttribute("aria-pressed", "true");
  $("play").innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  if (displayed !== index) await show(index);
  if (playing) timer = setTimeout(tick, +$("speed").value);
};
$("timeline").addEventListener("input", (e) => {
  pause();
  show(+e.target.value);
});
$("date-input").addEventListener("change", (e) => {
  const n = dates.indexOf(e.target.value);
  if (n >= 0) {
    pause();
    show(n);
  } else if (dates.length) e.target.value = dates[index];
});
$("previous").onclick = () => {
  pause();
  show(index - 1);
};
$("next").onclick = () => {
  pause();
  show(index + 1);
};
$("about-open").onclick = () => $("about").showModal();
$("about-close").onclick = () => $("about").close();
$("about").addEventListener("click", (e) => {
  if (e.target === $("about")) {
    const r = $("about").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("about").close();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
fetch(`${base}data/manifest.json`)
  .then((r) => {
    if (!r.ok) throw Error("Manifest unavailable");
    return r.json();
  })
  .then((m) => {
    dates = m.dates;
    if (dates.length !== 365) throw Error("Incomplete calendar");
    show(index);
  })
  .catch(() =>
    status("The calendar couldn’t load. Please reload to try again.", true),
  );

export { map };
