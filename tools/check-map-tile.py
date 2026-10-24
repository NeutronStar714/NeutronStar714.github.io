"""Inspect a downloaded vector tile without third-party protobuf packages."""
from collections import Counter
from pathlib import Path
import sys
import gzip

def varint(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, offset
        shift += 7

def fields(data):
    offset = 0
    while offset < len(data):
        key, offset = varint(data, offset)
        number, wire = key >> 3, key & 7
        if wire == 0:
            value, offset = varint(data, offset)
        elif wire == 2:
            length, offset = varint(data, offset)
            value = data[offset:offset + length]
            offset += length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            value = data[offset:offset + length]
            offset += length
        else:
            raise ValueError('Unsupported protobuf wire type')
        yield number, value

content = Path(sys.argv[1]).read_bytes()
if content.startswith(b'\x1f\x8b'):
    content = gzip.decompress(content)
for number, layer in fields(content):
    if number != 3:
        continue
    values = list(fields(layer))
    name = next(v.decode() for n, v in values if n == 1)
    if name not in ['transportation', 'streets']:
        continue
    keys = [v.decode() for n, v in values if n == 3]
    dictionary = [next((v.decode() if n == 1 else v for n, v in fields(value)), '') for n, value in values if n == 4]
    classes = Counter()
    for n, feature in values:
        if n != 2:
            continue
        tags = next((v for field, v in fields(feature) if field == 2), b'')
        indices, offset = [], 0
        while offset < len(tags):
            index, offset = varint(tags, offset)
            indices.append(index)
        attributes = {keys[k]: dictionary[v] for k, v in zip(indices[::2], indices[1::2])}
        classes[attributes.get('class', attributes.get('kind', 'unknown'))] += 1
    print('Transportation geometry by road class:', dict(classes))
    if not sum(classes.values()):
        raise SystemExit('No transportation geometry found')
