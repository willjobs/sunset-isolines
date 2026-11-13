import json, zipfile, platform, subprocess
from pathlib import Path
import shapely
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

subprocess.run(["node", "scripts/land.mjs"], check=True)
Path("public/states.geojson").write_text(Path(".cache/land.json").read_text())
land = unary_union(
    [shape(f["geometry"]) for f in json.load(open(".cache/land.json"))["features"]]
)
with zipfile.ZipFile(".cache/timezones.zip") as z:
    name = next(
        n for n in z.namelist() if n.endswith(".json") or n.endswith(".geojson")
    )
    raw = json.loads(z.read(name))
zones = {}
for f in raw["features"]:
    tz = f["properties"]["tzid"]
    if tz.startswith("America/"):
        geom = shape(f["geometry"])
        if geom.intersects(land):
            clipped = geom.intersection(land)
            if not clipped.is_empty:
                zones[tz] = clipped
print("Prepared", len(zones), "land-clipped time zones", flush=True)


def lines(g):
    if g.geom_type == "LineString":
        if g.length > 1e-7:
            yield g
    elif hasattr(g, "geoms"):
        for part in g.geoms:
            yield from lines(part)


frames = json.load(open(".cache/curves.json"))
out = Path("public/data")
out.mkdir(parents=True, exist_ok=True)
for frame in frames:
    features = []
    for f in frame["features"]:
        zone = zones.get(f["properties"]["tzid"])
        if zone is None:
            continue
        for line in lines(shape(f["geometry"]).intersection(zone)):
            coords = [[round(x, 5), round(y, 5)] for x, y in line.coords]
            features.append(
                {
                    "type": "Feature",
                    "properties": f["properties"],
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
    (out / (frame["date"] + ".geojson")).write_text(
        json.dumps(
            {"type": "FeatureCollection", "features": features}, separators=(",", ":")
        )
    )
manifest = {
    "year": 2026,
    "dates": [f["date"] for f in frames],
    "boundaryRelease": "2025b",
    "landMask": "us-atlas 3.0.1 states-10m",
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "tzdata": subprocess.check_output(
        ["node", "-p", "process.versions.tz"], text=True
    ).strip(),
    "shapely": shapely.__version__,
    "altitude": -0.833333,
    "latitudeStep": 0.1,
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(
    "Exported",
    len(frames),
    "frames;",
    sum(p.stat().st_size for p in out.glob("*.geojson")),
    "bytes",
    flush=True,
)
