"""Build a complete hourly partition inside each pinned land-clipped time zone."""

import gzip, json, zipfile, sys, subprocess
import shapely
from pathlib import Path
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import unary_union

frames = json.load(open(".cache/curves.json"))
wanted = {f["properties"]["tzid"] for f in frames[0]["features"]}
land = unary_union(
    [shape(f["geometry"]) for f in json.load(open(".cache/land.json"))["features"]]
)
with zipfile.ZipFile(".cache/timezones.zip") as z:
    raw = json.loads(
        z.read(next(n for n in z.namelist() if n.endswith((".json", ".geojson"))))
    )
zones = {
    f["properties"]["tzid"]: shape(f["geometry"]).intersection(land)
    for f in raw["features"]
    if f["properties"]["tzid"] in wanted
}
# The Census and OSM coastlines differ slightly. Assign their small uncovered
# fragments to the nearest US time zone, rather than leaving uncolored land.
remainder = land.difference(unary_union(list(zones.values())))
parts = list(remainder.geoms) if hasattr(remainder, "geoms") else [remainder]
for part in parts:
    if part.is_empty:
        continue
    tz = min(zones, key=lambda tz: zones[tz].distance(part.representative_point()))
    zones[tz] = zones[tz].union(part)
# Simplify shared zone boundaries once as a coverage, keeping matching edges.
keys = list(zones)
zones = dict(zip(keys, shapely.coverage_simplify(list(zones.values()), 0.002)))
Path(".cache/band-zones.json").write_text(
    json.dumps({tz: mapping(g) for tz, g in zones.items()})
)
land = unary_union(list(zones.values()))
out = Path("public/bands")
out.mkdir(exist_ok=True)
labels = ["Before 5 pm", "5–6 pm", "6–7 pm", "7–8 pm", "8–9 pm", "9 pm or later"]
for frame in frames:
    existing = out / (frame["date"] + ".geojson.gz")
    if "--resume" in sys.argv and existing.exists():
        cached = json.loads(gzip.decompress(existing.read_bytes()))
        if any(f["properties"].get("kind") == "band" for f in cached["features"]):
            continue
    by_zone = {}
    for f in frame["features"]:
        by_zone.setdefault(f["properties"]["tzid"], {})[
            f["properties"]["cutoffHour"]
        ] = f["geometry"]["coordinates"]
    features = []
    for tz, zone in zones.items():
        previous = None
        for bucket in range(6):
            if bucket < 5:
                paths = by_zone[tz][17 + bucket]
                curve = [
                    [lon - 360 if lon > 0 else lon, lat]
                    for path in paths
                    for lon, lat in path
                ]
                assert len(curve) > 250
                # The line-only export drops one-point fragments at the wrap.
                # Extend the end samples outside the US when that happens.
                if curve[0][1] > 24:
                    curve.insert(0, [curve[0][0], 24])
                if curve[-1][1] < 51:
                    curve.append([curve[-1][0], 51])
                # East of the threshold curve, sunset is earlier on the local clock.
                region = Polygon(curve + [[180, 51], [180, 24], curve[0]]).intersection(
                    zone
                )
                band = region if previous is None else region.difference(previous)
                previous = region
            else:
                band = zone.difference(previous)
            if band.is_empty:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {"kind": "band", "tzid": tz, "bucket": bucket},
                    "geometry": mapping(band),
                }
            )
    data = json.dumps(
        {"type": "FeatureCollection", "features": features}, separators=(",", ":")
    ).encode()
    (out / (frame["date"] + ".geojson.gz")).write_bytes(gzip.compress(data, mtime=0))
    if frame["date"].endswith("-01"):
        print(frame["date"], len(data), flush=True)
manifest = json.load(open("public/data/manifest.json"))
manifest["bands"] = {
    "buckets": labels,
    "format": "gzip GeoJSON",
    "bandSchema": 4,
    "coordinatePrecisionDegrees": 0.00001,
    "simplificationDegrees": 0.002,
    "coverage": "US zone polygons with Census/OSM coastal gaps assigned to nearest US zone",
    "colors": ["#6d587a", "#9c7183", "#c8897d", "#dfab75", "#efcf82", "#fff0ad"],
}
Path("public/data/manifest.json").write_text(json.dumps(manifest, indent=2))
print("Compressed bands:", sum(p.stat().st_size for p in out.glob("*.gz")), "bytes")

subprocess.run([sys.executable, "scripts/finish-bands.py"], check=True)
