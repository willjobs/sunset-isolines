import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
const $ = (id) => document.getElementById(id);
const hours = [17, 18, 19, 20];
const bandColors = ["#f5e7a3", "#efbb7e", "#dc8d80", "#8b9cce", "#354f88"];
const bandLabels = ["Before 5", "5–6", "6–7", "7–8", "8 or later"];
$("band-scale").innerHTML = bandLabels
  .map(
    (label, i) =>
      `<span><i style="background:${bandColors[i]}"></i>${label}</span>`,
  )
  .join("");
let activePopup;
let selectedHour = 18,
  currentFrame = null;
$("legend").innerHTML = [...hours, "none"]
  .map(
    (h) =>
      `<button type="button" data-hour="${h}" aria-pressed="${h === selectedHour}">${h === "none" ? "None" : `${h - 12} pm`}</button>`,
  )
  .join("");
$("legend").addEventListener("click", (e) => {
  const button = e.target.closest("[data-hour]");
  if (!button) return;
  selectedHour = button.dataset.hour === "none" ? "none" : +button.dataset.hour;
  document
    .querySelectorAll("#legend [data-hour]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  if (currentFrame && ready) renderContours();
});
function renderContours() {
  const bands = currentFrame.features.filter(
    (f) => f.properties.kind === "band",
  );
  const features = currentFrame.features.filter(
    (f) =>
      f.properties.kind === "threshold" &&
      f.properties.cutoffHour === selectedHour,
  );
  map
    .getSource("bands")
    .setData({ type: "FeatureCollection", features: bands });
  map.getSource("sunset").setData({ type: "FeatureCollection", features });
  $("map").dataset.hour = String(selectedHour);
  $("map").dataset.featureCount = String(features.length);
  $("map").dataset.bandCount = String(bands.length);
  $("contour-note").textContent =
    selectedHour === "none"
      ? "Tap the map for a local sunset time."
      : features.length
        ? `${selectedHour - 12}:00 pm cutoff highlighted · Tap the map to inspect`
        : `No ${selectedHour - 12}:00 pm boundary on this date. All five bands remain available.`;
  status(bands.length ? "" : "No sunset areas available on this date.");
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
  cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
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
      padding: { top: 45, bottom: 75, left: 20, right: 20 },
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
        { padding: { top: 45, bottom: 75, left: 20, right: 20 }, duration: 0 },
      );
  }, 150);
});
$("zoom-in").onclick = () => map.zoomIn();
$("zoom-out").onclick = () => map.zoomOut();
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
  map.addSource("sunset", { type: "geojson", data: empty });
  map.addSource("bands", { type: "geojson", data: empty });
  const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: "sunset-bands",
      type: "fill",
      source: "bands",
      paint: {
        "fill-color": [
          "match",
          ["get", "bucket"],
          ...bandColors.flatMap((c, i) => [i, c]),
          "#ccc",
        ],
        "fill-opacity": 0.88,
        "fill-antialias": false,
      },
    },
    firstLabel,
  );
  map.addSource("states", { type: "geojson", data: `${base}states.geojson` });
  map.addLayer({
    id: "state-boundaries",
    type: "line",
    source: "states",
    paint: { "line-color": "#859b8b", "line-width": 0.6, "line-opacity": 0.4 },
  });
  const label = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: "sunset-casing",
      type: "line",
      source: "sunset",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#fffdf2",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 5, 7, 7],
        "line-opacity": 0.85,
      },
    },
    label,
  );
  map.addLayer(
    {
      id: "sunset-lines",
      type: "line",
      source: "sunset",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#253a3a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.4, 7, 3.5],
        "line-opacity": 0.95,
      },
    },
    label,
  );
  map.addLayer({
    id: "sunset-hit",
    type: "line",
    source: "sunset",
    paint: { "line-width": 18, "line-opacity": 0 },
  });
  map.addLayer({
    id: "sunset-labels",
    type: "symbol",
    source: "sunset",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 190,
      "text-field": [
        "concat",
        ["to-string", ["-", ["get", "cutoffHour"], 12]],
        ":00 pm cutoff",
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-letter-spacing": 0.04,
      "text-padding": 5,
      "text-keep-upright": true,
    },
    paint: {
      "text-color": "#253a3a",
      "text-halo-color": "#fffdf2",
      "text-halo-width": 2.5,
    },
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
    "sunset-bands",
    () => (map.getCanvas().style.cursor = "crosshair"),
  );
  map.on(
    "mouseleave",
    "sunset-bands",
    () => (map.getCanvas().style.cursor = ""),
  );
  map.on("click", "sunset-bands", async (e) => {
    const f = e.features[0];
    if (!f || displayed < 0) return;
    pause();
    activePopup?.remove();
    const date = dates[displayed],
      tz = f.properties.tzid;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "290px" })
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
  $("date-display").innerHTML =
    `${d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}<span>2026</span>`;
  $("day-number").textContent = `DAY ${index + 1} OF 365`;
  const events = {
    "03-20": "THE SPRING EQUINOX",
    "06-21": "THE SUMMER SOLSTICE",
    "09-22": "THE AUTUMN EQUINOX",
    "12-21": "THE WINTER SOLSTICE",
    "03-08": "DAYLIGHT SAVING BEGINS",
    "11-01": "STANDARD TIME RETURNS",
  };
  const season =
    index < 78 || index >= 354
      ? "WINTER"
      : index < 171
        ? "SPRING"
        : index < 264
          ? "SUMMER"
          : "AUTUMN";
  $("season").textContent = events[key.slice(5)] || `AN EVENING IN ${season}`;
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
    currentFrame = frame;
    renderContours();
    displayed = index;
    $("map").dataset.date = dates[index];
    for (let n = 1; n <= 2; n++)
      fetchFrame((index + n) % dates.length).catch(() => {});
    return true;
  } catch (e) {
    if (token === revision) {
      activePopup?.remove();
      activePopup = null;
      currentFrame = null;
      map.getSource("bands").setData(empty);
      map.getSource("sunset").setData(empty);
      delete $("map").dataset.date;
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
  $("play-label").textContent = "Let the year unfold";
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
  $("play-label").textContent = "Following the evening";
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
document.querySelectorAll("[data-date]").forEach(
  (b) =>
    (b.onclick = () => {
      pause();
      show(dates.indexOf(b.dataset.date));
    }),
);
for (const id of ["about-open", "method-open"])
  $(id).onclick = () => $("about").showModal();
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
