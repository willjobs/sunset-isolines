"""Derive cutoff edges shared by earlier/later regions and compact daily files."""

import gzip, json
import shapely
from pathlib import Path
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union


def polygons(g):
    if g.geom_type == "Polygon":
        yield g
    elif hasattr(g, "geoms"):
        for part in g.geoms:
            yield from polygons(part)


def rounded(value):
    if isinstance(value, float):
        return round(value, 5)
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def finish(path):
    data = json.loads(gzip.decompress(path.read_bytes()))
    if data.get("bandSchema") == 3:
        return
    features = []
    for f in data["features"]:
        if f["properties"].get("kind") != "band":
            continue
        geometry = shapely.make_valid(shape(f["geometry"]))
        if geometry.geom_type == "GeometryCollection":
            geometry = unary_union(
                [
                    g
                    for g in geometry.geoms
                    if g.geom_type in ("Polygon", "MultiPolygon")
                ]
            )
        geometry = shapely.set_precision(geometry, 0.00001).intersection(
            box(-125, 24, -66, 51)
        )
        geometry = unary_union(list(polygons(geometry)))
        if geometry.is_empty:
            continue
        features.append({**f, "geometry": mapping(geometry)})
    buckets = {
        b: unary_union(
            [shape(f["geometry"]) for f in features if f["properties"]["bucket"] == b]
        )
        for b in range(5)
    }
    for hour in range(17, 21):
        earlier = unary_union([g for b, g in buckets.items() if b < hour - 16])
        later = unary_union([g for b, g in buckets.items() if b >= hour - 16])
        if earlier.is_empty or later.is_empty:
            continue
        # Only a boundary shared by earlier AND later sunset is a threshold.
        # This excludes coasts, including microscopic overlay artifacts.
        edge = later.boundary.intersection(earlier.buffer(0.0000001))
        if edge.is_empty:
            continue
        parts = list(edge.geoms) if hasattr(edge, "geoms") else [edge]
        parts = [p for p in parts if p.geom_type == "LineString" and p.length > 0.00001]
        if not parts:
            continue
        line = unary_union(parts)
        features.append(
            {
                "type": "Feature",
                "properties": {"kind": "threshold", "cutoffHour": hour},
                "geometry": mapping(line),
            }
        )
    result = rounded(
        {"type": "FeatureCollection", "bandSchema": 3, "features": features}
    )
    path.write_bytes(
        gzip.compress(json.dumps(result, separators=(",", ":")).encode(), mtime=0)
    )


if __name__ == "__main__":
    from concurrent.futures import ProcessPoolExecutor

    with ProcessPoolExecutor(max_workers=3) as pool:
        list(pool.map(finish, sorted(Path("public/bands").glob("*.gz"))))
    print(
        "Compacted complete year:",
        sum(p.stat().st_size for p in Path("public/bands").glob("*.gz")),
        "bytes",
        flush=True,
    )
