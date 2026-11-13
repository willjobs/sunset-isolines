"""Check full coverage, non-overlap, and prepare independent astronomy samples."""

import gzip, json
from pathlib import Path
from shapely.geometry import shape, Point, box
from shapely.ops import unary_union

zones = {
    tz: shape(g).intersection(box(-125, 24, -66, 51))
    for tz, g in json.load(open(".cache/band-zones.json")).items()
}
land = unary_union(list(zones.values()))
samples = []
dates = [
    "2026-03-01",
    "2026-03-07",
    "2026-03-08",
    "2026-03-20",
    "2026-06-21",
    "2026-09-22",
    "2026-10-31",
    "2026-11-01",
    "2026-12-21",
]
for path in sorted(Path("public/bands").glob("*.gz")):
    data = json.loads(gzip.decompress(path.read_bytes()))
    bands = [f for f in data["features"] if f["properties"]["kind"] == "band"]
    geoms = [shape(f["geometry"]) for f in bands]
    coverage = unary_union(geoms)
    assert coverage.symmetric_difference(land).area < 0.01, path
    assert abs(sum(g.area for g in geoms) - coverage.area) < 0.00001, path
    date = path.name[:10]
    if date in dates:
        for f, g in zip(bands, geoms):
            p = g.representative_point()
            # Skip subpixel slivers where numerical rounding can move the hour.
            if g.boundary.distance(p) < 0.003:
                continue
            samples.append(
                {
                    "date": date,
                    "tzid": f["properties"]["tzid"],
                    "bucket": f["properties"]["bucket"],
                    "lon": p.x,
                    "lat": p.y,
                }
            )
        for tz, lon, lat in [
            ("America/Phoenix", -112.074, 33.448),
            ("America/Denver", -109.052, 35.681),
            ("America/Phoenix", -110.535, 35.835),
        ]:
            matches = [f for f, g in zip(bands, geoms) if g.covers(Point(lon, lat))]
            assert len(matches) == 1 and matches[0]["properties"]["tzid"] == tz, (
                date,
                tz,
                matches,
            )
Path(".cache/band-samples.json").write_text(json.dumps(samples))
print(
    "Band partitions cover all modeled land, have no overlapping area, and preserve Arizona reference zones.",
    len(samples),
    "independent samples prepared.",
)
