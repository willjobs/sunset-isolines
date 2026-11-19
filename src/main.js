import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { loadAtlas } from "./atlas-data.js";
import { SunsetLayer } from "./sunset-layer.js";
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
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});
let dateLabels = [];
let atlasData = null,
  atlas = null,
  mapLoaded = false;
function initializeAtlas() {
  if (!mapLoaded || !atlasData || atlas) return;
  dates = atlasData.meta.dates;
  dateLabels = dates.map((date) =>
    dateFormatter.format(new Date(date + "T12:00:00Z")),
  );
  atlas = new SunsetLayer(atlasData, bandColors, (day) => {
    if (displayed === day) return;
    displayed = day;
    $("map").dataset.date = dates[day];
  });
  const labels = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(atlas, labels);
  ready = true;
  $("map").dataset.renderer = "gpu";
  $("map").dataset.bandCount = "6";
  status("");
  show(index);
}
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
// Use the visitor's local calendar day, with February 29 clamped to February 28
// because the atlas's 2026 calendar is not a leap year.
const today = new Date();
const initialDate = Date.UTC(
  2026,
  today.getMonth(),
  today.getMonth() === 1 ? Math.min(today.getDate(), 28) : today.getDate(),
);
let dates = [],
  index = (initialDate - Date.UTC(2026, 0, 1)) / 86400000,
  displayed = -1,
  playing = false,
  timer,
  ready = false;
$("date-input").value = new Date(initialDate).toISOString().slice(0, 10);
$("timeline").value = index;
$("timeline").setAttribute("aria-valuetext", dateFormatter.format(initialDate));
const status = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
const usBounds = [
  [-125, 24],
  [-66.5, 50],
];
const usPadding = { top: 12, bottom: 28, left: 10, right: 10 };
const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/positron",
  bounds: usBounds,
  fitBoundsOptions: { padding: usPadding },
  minZoom: 1,
  maxZoom: 9,
  renderWorldCopies: false,
  attributionControl: { compact: true },
  fadeDuration: 200,
  cooperativeGestures: false,
  trackResize: false,
});
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
const container = map.getContainer();
const fit = () => {
  if (!container.clientWidth || !container.clientHeight) return;
  map.stop();
  map.resize();
  map.fitBounds(usBounds, { padding: usPadding, duration: 0 });
};
// MapLibre skips its first resize notification. It can already describe a
// different size from the one measured during construction.
const resizeObserver = new ResizeObserver(fit);
resizeObserver.observe(container);
map.once("remove", () => resizeObserver.disconnect());
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
  map.on("click", async (e) => {
    if (!atlas || displayed < 0) return;
    const tz = atlas.zoneAt(e.lngLat.lng, e.lngLat.lat);
    if (!tz) return;
    pause();
    activePopup?.remove();
    const date = dates[displayed];
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
  });
  mapLoaded = true;
  initializeAtlas();
});
function updateDate() {
  const key = dates[index];
  $("timeline").value = index;
  $("timeline").setAttribute("aria-valuetext", dateLabels[index] || key);
  $("date-input").value = key;
}
function show(i) {
  if (!dates.length) return false;
  index = (i + dates.length) % dates.length;
  updateDate();
  if (!ready) return false;
  activePopup?.remove();
  activePopup = null;
  atlas.setDay(index);
  return true;
}
function pause() {
  const wasPlaying = playing;
  playing = false;
  clearTimeout(timer);
  timer = null;
  if (!wasPlaying) return;
  $("play").setAttribute("aria-label", "Play animation");
  $("play").setAttribute("aria-pressed", "false");
  $("play").innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>';
}
function tick() {
  if (!playing) return;
  show(index + 1);
  if (playing) timer = setTimeout(tick, +$("speed").value);
}
$("play").onclick = () => {
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
  if (displayed !== index) show(index);
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
loadAtlas(base)
  .then((data) => {
    atlasData = data;
    dates = data.meta.dates;
    initializeAtlas();
  })
  .catch((error) => {
    console.warn("Sunset atlas:", error.message);
    status("The sunset atlas couldn’t load. Please reload to try again.", true);
  });

export { map, atlas };
