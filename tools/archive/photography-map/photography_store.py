"""Local photography authoring. Nothing in this module is shipped in dist/."""
from __future__ import annotations

from hashlib import sha1
from io import BytesIO
import json
import math
from pathlib import Path
import re
import shutil
import threading
from uuid import uuid4
from urllib.parse import urlsplit

from PIL import Image, ImageOps, UnidentifiedImageError


class UnsupportedPhoto(ValueError):
    def __init__(self, image_format):
        super().__init__('Unsupported image')
        self.image_format = image_format


class PhotographyStore:
    def __init__(self, root: Path):
        self.root = root
        self.dist = root / "dist"
        self.data_path = self.dist / "photography.json"
        self.state_path = root / ".local" / "photography-editor.json"
        self.lock = threading.RLock()

    def enabled(self):
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8")).get("enabled") is True
        except (OSError, ValueError):
            return False

    def set_enabled(self, enabled):
        with self.lock:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            self._json(self.state_path, {"enabled": bool(enabled)})

    @staticmethod
    def _json(path, value):
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def read(self):
        data = json.loads(self.data_path.read_text(encoding="utf-8"))
        data['version'] = 2
        for place in data['places']:
            place.setdefault('level', 'region')
        for photo in data['photos']:
            photo.setdefault('coordinates', None)
        return data

    @staticmethod
    def point(value):
        if value is None:
            return None
        if not isinstance(value, dict) or value.get('lat') in ('', None) or value.get('lng') in ('', None):
            raise ValueError('Invalid coordinates')
        lat, lng = float(value['lat']), float(value['lng'])
        if not math.isfinite(lat) or not math.isfinite(lng) or not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise ValueError('Invalid coordinates')
        return {'lat': round(lat, 6), 'lng': round(lng, 6),
                'source': 'gps' if value.get('source') == 'gps' else 'manual'}

    @staticmethod
    def text(value, limit=5000):
        value = str(value).strip()
        if not value or len(value) > limit or any(line.startswith("```") for line in value.splitlines()):
            raise ValueError("Invalid text")
        return value

    def _append_copy(self, value):
        source = " ".join(value.split())
        slug = re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-")[:38].strip("-") or "text"
        key = f"photography.{slug}-{sha1(source.encode('utf-8')).hexdigest()[:8]}"
        markdown = self.root / "website-text.md"
        existing = markdown.read_text(encoding="utf-8") if markdown.exists() else ""
        if f"### `{key}`" not in existing:
            with markdown.open("a", encoding="utf-8", newline="\n") as output:
                output.write(f"\n## Photography\n\n### `{key}`\n\n```text\n{value}\n```\n\n")
        manifest_path = self.dist / "website-text-map.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
        if not any(item["key"] == key for item in manifest):
            manifest.append({"key": key, "page": "photography", "source": source})
            self._json(manifest_path, manifest)
        shutil.copyfile(markdown, self.dist / "website-text.md")
        return key

    def save_place(self, payload):
        name = self.text(payload.get("name", ""), 150)
        point = self.point(payload)
        with self.lock:
            data = self.read()
            place_id = payload.get("id")
            place = next((item for item in data["places"] if item["id"] == place_id), None)
            if place_id and place is None:
                raise ValueError("Unknown place")
            if place is None:
                place = {"id": uuid4().hex}
            level = payload.get('level', place.get('level', 'region'))
            if level not in {'region', 'location'}:
                raise ValueError('Invalid hierarchy')
            if place.get('level') and place['level'] != level:
                raise ValueError('Invalid hierarchy')
            parent = payload.get('parentId', place.get('parentId'))
            if level == 'location' and not any(p['id'] == parent and p['level'] == 'region' for p in data['places']):
                raise ValueError('Invalid hierarchy')
            place.update(name=name, lat=point['lat'], lng=point['lng'], level=level)
            if level == 'location':
                place['parentId'] = parent
            else:
                place.pop('parentId', None)
            if not place_id:
                data['places'].append(place)
            self._append_copy(name)
            self._json(self.data_path, data)
            return place

    def delete_place(self, payload):
        """Remove a named grouping; keep every photograph, coordinate and Markdown entry."""
        with self.lock:
            data = self.read()
            place = next((p for p in data['places'] if p['id'] == payload.get('id')), None)
            if place is None:
                raise ValueError('Unknown place')
            children = [p for p in data['places'] if p.get('parentId') == place['id']]
            photos = [p for p in data['photos'] if p['placeId'] == place['id']]
            target_id = payload.get('targetId') or (place.get('parentId') if place['level'] == 'location' else None)
            target = next((p for p in data['places'] if p['id'] == target_id and p['level'] == 'region' and p['id'] != place['id']), None)
            if (children or photos) and target is None:
                raise ValueError('Reassignment required')
            for child in children:
                child['parentId'] = target['id']
            for photo in photos:
                photo['placeId'] = target['id']
            data['places'] = [p for p in data['places'] if p['id'] != place['id']]
            self._json(self.data_path, data)

    def save_photo(self, payload):
        caption = self.text(payload.get('caption', ''))
        point = self.point(payload.get('coordinates'))
        with self.lock:
            data = self.read()
            if not any(p['id'] == payload.get('placeId') for p in data['places']):
                raise ValueError('Unknown place')
            photo = next((p for p in data['photos'] if p['id'] == payload.get('id')), None)
            if photo is None:
                raise ValueError('Unknown photograph')
            photo.update(caption=caption, captionKey=self._append_copy(caption),
                         placeId=payload['placeId'], coordinates=point)
            self._json(self.data_path, data)
            return photo

    @staticmethod
    def _gps_location(image):
        """Read a camera GPS IFD; absent or damaged tags are never a guessed location."""
        try:
            gps = image.getexif().get_ifd(34853)
            def coordinate(value, reference, positive, negative, limit):
                if isinstance(reference, bytes):
                    reference = reference.decode('ascii').rstrip('\x00')
                if reference not in {positive, negative} or len(value) != 3:
                    raise ValueError('Invalid GPS')
                degrees, minutes, seconds = map(float, value)
                if (not all(math.isfinite(part) for part in (degrees, minutes, seconds)) or
                        not 0 <= degrees <= limit or not 0 <= minutes < 60 or not 0 <= seconds < 60):
                    raise ValueError('Invalid GPS')
                result = degrees + minutes / 60 + seconds / 3600
                if result > limit:
                    raise ValueError('Invalid GPS')
                return round(-result if reference == negative else result, 6)
            return {'lat': coordinate(gps[2], gps[1], 'N', 'S', 90),
                    'lng': coordinate(gps[4], gps[3], 'E', 'W', 180)}
        except (KeyError, ValueError, TypeError, AttributeError, IndexError, OSError, OverflowError, ZeroDivisionError):
            return None

    def inspect_photo(self, content):
        """Inspect an authenticated, local upload without saving the image or its metadata."""
        if len(content) > 30 * 1024 * 1024:
            raise ValueError('Photo exceeds 30 MB')
        try:
            with Image.open(BytesIO(content)) as image:
                self.validate_image(image)
                return {'location': self._gps_location(image), 'width': image.width, 'height': image.height,
                        'format': image.format}
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise ValueError('Invalid image') from error

    @staticmethod
    def validate_image(image):
        # Some camera .jpg files are detected as MPO, a multi-picture JPEG.
        # Accept photographic raster decoders, then publish only the primary frame.
        if image.format not in {'JPEG', 'MPO', 'PNG', 'WEBP', 'TIFF', 'AVIF', 'BMP', 'JPEG2000', 'HEIF'}:
            raise UnsupportedPhoto(image.format)
        if image.width * image.height > 60_000_000:
            raise ValueError('Photo exceeds 60 megapixels')

    def story_details(self, details):
        if not isinstance(details, dict):
            raise ValueError('Invalid story')
        result = {}
        for field, limit in [('title', 200), ('quote', 2000), ('quoteCredit', 300),
                             ('context', 15000), ('extract', 15000), ('extractCredit', 500), ('credit', 300)]:
            value = details.get(field, '')
            if value:
                result[field] = self.text(value, limit)
        sources = details.get('sources', [])
        if not isinstance(sources, list) or len(sources) > 20:
            raise ValueError('Invalid sources')
        if sources:
            result['sources'] = []
            for source in sources:
                title = self.text(source['title'], 500)
                url = self.text(source['url'], 2000)
                parsed = urlsplit(url)
                if parsed.scheme not in {'https', 'http'} or not parsed.netloc:
                    raise ValueError('Invalid source URL')
                result['sources'].append({'title': title, 'url': url})
        documentary = details.get('documentary')
        if documentary:
            src = self.text(documentary['src'], 2000)
            parsed = urlsplit(src)
            remote = parsed.scheme in {'https', 'http'} and bool(parsed.netloc)
            local = (not parsed.scheme and not parsed.netloc and '\\' not in src and
                     '..' not in parsed.path.split('/') and
                     parsed.path.lstrip('/').startswith(('assets/', 'musicsources/')))
            if not (remote or local):
                raise ValueError('Invalid documentary URL')
            result['documentary'] = {'src': src, 'kind': 'audio' if documentary.get('kind') == 'audio' else 'video'}
            for field in ['title', 'caption']:
                if documentary.get(field):
                    result['documentary'][field] = self.text(documentary[field], 2000)
        return result

    def _append_story_copy(self, details):
        for field in ['title', 'quote', 'quoteCredit', 'context', 'extract', 'extractCredit', 'credit']:
            if details.get(field):
                self._append_copy(details[field])
        for source in details.get('sources', []):
            self._append_copy(source['title'])
        for field in ['title', 'caption']:
            if details.get('documentary', {}).get(field):
                self._append_copy(details['documentary'][field])

    def save_story(self, photo_id, details):
        details = self.story_details(details)
        with self.lock:
            data = self.read()
            photo = next((item for item in data['photos'] if item['id'] == photo_id), None)
            if photo is None:
                raise ValueError('Unknown photograph')
            self._append_story_copy(details)
            # Updating story fields never prunes their old Markdown entries.
            for key in ['title', 'quote', 'quoteCredit', 'context', 'extract', 'extractCredit', 'credit', 'sources', 'documentary']:
                photo.pop(key, None)
            photo.update(details)
            self._json(self.data_path, data)
            return photo

    def upload(self, place_id, caption, content, details=None, coordinates='auto'):
        caption = self.text(caption)
        details = self.story_details(details or {})
        if len(content) > 30 * 1024 * 1024:
            raise ValueError("Photo exceeds 30 MB")
        try:
            with Image.open(BytesIO(content)) as image:
                self.validate_image(image)
                image.load()
                gps = self._gps_location(image)
                point = self.point(dict(gps, source='gps') if gps else None) if coordinates == 'auto' else self.point(coordinates)
                clean = ImageOps.exif_transpose(image).convert("RGB")
                # Preserve the full pixel dimensions, without GPS or camera metadata.
                buffer = BytesIO()
                clean.save(buffer, "JPEG", quality=95, subsampling=0)
                width, height = clean.size
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise ValueError("Invalid image") from error
        with self.lock:
            data = self.read()
            if not any(place["id"] == place_id for place in data["places"]):
                raise ValueError("Unknown place")
            photo_id = uuid4().hex
            path = self.dist / "assets" / "photography" / f"{photo_id}.jpg"
            path.parent.mkdir(parents=True, exist_ok=True)
            caption_key = self._append_copy(caption)
            self._append_story_copy(details)
            path.write_bytes(buffer.getvalue())
            photo = {"id": photo_id, "placeId": place_id, "src": path.relative_to(self.dist).as_posix(),
                     "caption": caption, "captionKey": caption_key, "width": width, "height": height,
                     "coordinates": point}
            photo.update(details)
            data["photos"].append(photo)
            self._json(self.data_path, data)
            return photo
