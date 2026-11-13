"""Optional geographic validation after prepare:data and generate."""
import json, zipfile
from pathlib import Path
from shapely.geometry import shape, Point
from shapely.ops import unary_union
with zipfile.ZipFile('.cache/timezones.zip') as z:
    name=next(n for n in z.namelist() if n.endswith(('.json','.geojson')))
    raw=json.loads(z.read(name))
zones={f['properties']['tzid']:shape(f['geometry']) for f in raw['features']}
for tz,lon,lat in [('America/Phoenix',-112.074,33.448),('America/Denver',-109.052,35.681),('America/Phoenix',-110.535,35.835),('America/New_York',-84.388,33.749),('America/Chicago',-86.782,36.162)]:
    assert zones[tz].covers(Point(lon,lat)),(tz,lon,lat)
land=unary_union([shape(f['geometry']) for f in json.load(open('.cache/land.json'))['features']])
valid={tz:g.intersection(land).buffer(.00002) for tz,g in zones.items() if tz.startswith('America/') and g.intersects(land)}
count=0
for path in Path('public/data').glob('*.geojson'):
    for f in json.loads(path.read_text())['features']:
        assert valid[f['properties']['tzid']].covers(shape(f['geometry'])),(path,f['properties'])
        count+=1
print(f'Validated {count} segments against land and time-zone polygons; Phoenix, Navajo, Hopi and interstate reference points passed.')
