"""Prepare a locally hosted, quiet VersaTiles style from the reviewed source."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local/archive-map'
style = json.loads((LOCAL / 'versatiles-style.json').read_text(encoding='utf-8'))
style['name'] = 'NeutronStar714 photography'
for key in ['sprite', 'sky', 'owner', 'id']:
    style.pop(key, None)
source = next(iter(style['sources'].values()))
source['attribution'] = source['attribution'].replace(' · ', ', ') + ', <a href="https://versatiles.org/">VersaTiles</a>'
style['sources'] = {'archive-tiles': source}
style['projection'] = {'type': 'mercator'}
layers = []
for layer in style['layers']:
    if layer['id'].startswith(('label-boundary', 'poi-', 'symbol-transit', 'marking-', 'label-address', 'label-motorway')):
        continue
    if 'source' in layer:
        layer['source'] = 'archive-tiles'
    layout = layer.get('layout', {})
    layout.pop('icon-image', None)
    for key in list(layer.get('paint', {})):
        if 'pattern' in key:
            layer['paint'].pop(key)
    if 'text-transform' in layout:
        layout['text-transform'] = 'none'
    if layer['type'] == 'symbol':
        layer['minzoom'] = max(layer.get('minzoom', 0), 10)
        layout['text-field'] = ['coalesce', ['get', 'name'], ['get', 'name_en']]
    if layer['id'] == 'background':
        layer['paint']['background-color'] = '#eeeae1'
    if layer['type'] == 'fill' and layer.get('source-layer') in ['ocean', 'water_polygons']:
        layer['paint']['fill-color'] = '#b8cdd0'
    layers.append(layer)
style['layers'] = layers
(ROOT / 'dist/photography-map-style.json').write_text(json.dumps(style, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
(ROOT / 'dist/vendor/maplibre/SOURCE.txt').write_text(
    'MapLibre GL JS 5.6.2. BSD-3-Clause.\nhttps://unpkg.com/maplibre-gl@5.6.2/\n\n'
    'Photography style derived from VersaTiles Colorful (generated style metadata: CC0).\n'
    'https://tiles.versatiles.org/assets/styles/colorful/style.json\n'
    'https://github.com/versatiles-org/versatiles-style\nCountry labels omitted; uppercase text disabled.\n'
    'Vector tiles: https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}\n'
    'OpenStreetMap and ESA WorldCover attribution is retained on the map.\n'
    'Public service documentation: https://versatiles.org/\n', encoding='utf-8')
print(f'Prepared {len(layers)} layers; native vector zoom {source["maxzoom"]}, overzoom supported.')
