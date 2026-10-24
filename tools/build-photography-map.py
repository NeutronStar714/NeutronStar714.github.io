"""Build compact, label-free regional layers from Natural Earth shapefiles.

Requires the existing Shapely runtime. Source archives belong in .local/map-data/:
https://naciscdn.org/naturalearth/10m/cultural/ne_10m_roads.zip
https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces_lines.zip
Natural Earth data is public domain. No source attributes or labels are published.
"""
import json
from pathlib import Path
import struct
from zipfile import ZipFile

from shapely.geometry import LineString, box

ROOT = Path(__file__).resolve().parents[1]
REGION = box(73, 17, 136, 54)
OUTPUT = ROOT / 'dist/vendor/natural-earth'


def lines(name):
    with ZipFile(ROOT / '.local/map-data' / (name + '.zip')) as archive:
        content = archive.read(next(item for item in archive.namelist() if item.endswith('.shp')))
    offset = 100
    while offset < len(content):
        size = struct.unpack_from('>i', content, offset + 4)[0] * 2
        record = memoryview(content)[offset + 8:offset + 8 + size]
        offset += 8 + size
        if len(record) < 44 or struct.unpack_from('<i', record)[0] not in (3, 13, 23):
            continue
        if not REGION.intersects(box(*struct.unpack_from('<4d', record, 4))):
            continue
        parts, count = struct.unpack_from('<2i', record, 36)
        starts = list(struct.unpack_from(f'<{parts}i', record, 44)) + [count]
        points_offset = 44 + parts * 4
        for start, end in zip(starts, starts[1:]):
            if end - start < 2:
                continue
            points = [struct.unpack_from('<2d', record, points_offset + index * 16) for index in range(start, end)]
            clipped = LineString(points).intersection(REGION)
            for line in getattr(clipped, 'geoms', [clipped]):
                if line.geom_type == 'LineString' and not line.is_empty:
                    yield line


for source, output, tolerances in [
    ('ne_10m_roads', 'china-roads', [('.overview', .025), ('.detail', .002)]),
    ('ne_10m_admin_1_states_provinces_lines', 'china-provinces', [('', .006)]),
]:
    original = list(lines(source))
    for suffix, tolerance in tolerances:
        coordinates = [[[round(x, 5), round(y, 5)] for x, y in line.simplify(tolerance).coords] for line in original]
        data = {'type': 'Feature', 'properties': {},
                'geometry': {'type': 'MultiLineString', 'coordinates': coordinates}}
        path = OUTPUT / (output + suffix + '.geojson')
        path.write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
        print(f'{path.name}: {len(coordinates)} lines, {path.stat().st_size:,} bytes')
