"""Migrate the existing filled calendar to six buckets using the 21:00 curves."""

import gzip, json
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
from shapely.geometry import shape, mapping, Polygon

curves = {
    frame["date"]: {
        f["properties"]["tzid"]: f["geometry"]["coordinates"]
        for f in frame["features"]
        if f["properties"]["cutoffHour"] == 21
    }
    for frame in json.load(open(".cache/curves.json"))
}


def migrate(path):
    data = json.loads(gzip.decompress(path.read_bytes()))
    if data.get("bandSchema") == 4:
        return
    features = []
    for f in data["features"]:
        if f["properties"].get("kind") != "band":
            continue
        if f["properties"]["bucket"] != 4:
            features.append(f)
            continue
        coordinates = [
            [lon - 360 if lon > 0 else lon, lat]
            for part in curves[path.name[:10]][f["properties"]["tzid"]]
            for lon, lat in part
        ]
        if coordinates[0][1] > 24:
            coordinates.insert(0, [coordinates[0][0], 24])
        if coordinates[-1][1] < 51:
            coordinates.append([coordinates[-1][0], 51])
        region = Polygon(coordinates + [[180, 51], [180, 24], coordinates[0]])
        geometry = shape(f["geometry"])
        for bucket, band in [
            (4, geometry.intersection(region)),
            (5, geometry.difference(region)),
        ]:
            if band.is_empty:
                continue
            features.append(
                {
                    **f,
                    "properties": {**f["properties"], "bucket": bucket},
                    "geometry": mapping(band),
                }
            )
    path.write_bytes(
        gzip.compress(
            json.dumps(
                {"type": "FeatureCollection", "features": features},
                separators=(",", ":"),
            ).encode(),
            mtime=0,
        )
    )


if __name__ == "__main__":
    with ProcessPoolExecutor(max_workers=3) as pool:
        list(pool.map(migrate, sorted(Path("public/bands").glob("*.gz"))))
