"""Read-only import of the numbered candidates; write derivatives only in this project."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'D:\Stuffs\+Mission\^Website Photo Candidates\nanjing')
ARCHIVE = ROOT / 'tools' / 'archive' / 'photography-map'
ARCHIVE.mkdir(parents=True, exist_ok=True)
for name in ['dist/photography.html', 'dist/photography.css', 'dist/photography.js',
             'dist/photography.json', 'tools/photography-editor.html',
             'tools/photography-editor.css', 'tools/photography-editor.js',
             'photography_store.py']:
    target = ARCHIVE / name
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)

DEST = ROOT / 'dist/assets/photo-albums'
DEST.mkdir(parents=True, exist_ok=True)
photos = []
proof = []
sheet = Image.new('RGB', (1000, 7 * 160), '#16191b')
draw = ImageDraw.Draw(sheet)
for number in range(1, 27):
    source = next(p for p in SOURCE.iterdir() if p.stem == str(number))
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    with Image.open(source) as image:
        clean = ImageOps.exif_transpose(image).convert('RGB')
        width, height = clean.size
        for suffix, limit, quality in [('full', max(width, height), 90), ('screen', 2200, 88), ('thumb', 720, 83)]:
            copy = clean.copy()
            copy.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            copy.save(DEST / f'{number:02d}-{suffix}.webp', 'WEBP', quality=quality, method=4)
        thumbnail = clean.copy()
        thumbnail.thumbnail((240, 130))
        x, y = ((number - 1) % 4) * 250, ((number - 1) // 4) * 160
        sheet.paste(thumbnail, (x + (250 - thumbnail.width) // 2, y))
        draw.text((x + 10, y + 136), str(number), fill='white')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    proof.append({'filename': source.name, 'sha256': before})
    photos.append({'id': f'candidate-{number:02d}', 'filename': source.name, 'caption': '',
                   'src': f'assets/photo-albums/{number:02d}-full.webp',
                   'screen': f'assets/photo-albums/{number:02d}-screen.webp',
                   'thumbnail': f'assets/photo-albums/{number:02d}-thumb.webp',
                   'width': width, 'height': height})

# Keep existing uploads available in the pool without assigning them to new albums.
old = json.loads((ARCHIVE / 'dist/photography.json').read_text(encoding='utf-8'))
for photo in old['photos']:
    photos.append(dict(photo, filename=photo.get('filename', photo['id']),
                       screen=photo['src'], thumbnail=photo.get('thumbnail', photo['src'])))

definitions = [
    ('road-systems', 'Road systems across the country', range(1, 10), 3),
    ('blue-hour', 'The blue hour', range(10, 16), 10),
    ('3300-kelvin', '3300 degrees Kelvin', range(22, 25), 22),
    ('figures-in-motion', 'Figures in motion', range(19, 22), 19),
    ('hiking', 'Hiking, on the way', range(15, 19), 16),
    ('band', 'Shots for the band', range(25, 27), 25),
]
data = {'version': 1, 'albums': [
    {'id': key, 'title': title, 'photoIds': [f'candidate-{n:02d}' for n in numbers],
     'coverId': f'candidate-{cover:02d}'} for key, title, numbers, cover in definitions
], 'photos': photos}
target = ROOT / 'dist/photo-albums.json'
if target.exists():
    raise SystemExit('Albums already exist; import will not replace authored album data.')
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(ROOT / '.local/photo-source-hashes.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
sheet.save(ROOT / '.local/photo-candidates.jpg')
print(f'Imported 26 candidates; retained {len(old["photos"])} previous uploads in the pool. Source hashes unchanged.')
