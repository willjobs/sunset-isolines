"""Recover the fixed, validated land/time-zone partition from a reference frame."""

import gzip, json
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

frame = json.loads(
    gzip.decompress(Path("public/bands/2026-01-01.geojson.gz").read_bytes())
)
zones = {}
for f in frame["features"]:
    zones.setdefault(f["properties"]["tzid"], []).append(shape(f["geometry"]))
features = [
    {
        "type": "Feature",
        "properties": {"tzid": tz},
        "geometry": mapping(unary_union(parts)),
    }
    for tz, parts in sorted(zones.items())
]
Path(".cache").mkdir(exist_ok=True)
Path(".cache/atlas-zones.geojson").write_text(
    json.dumps({"type": "FeatureCollection", "features": features})
)
print("Prepared", len(features), "fixed land/time-zone regions")
