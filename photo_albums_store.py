"""Album memberships reference a shared pool. Private authoring never ships in dist/."""
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from PIL import Image, ImageOps, UnidentifiedImageError
from photography_store import PhotographyStore


class PhotoAlbumStore(PhotographyStore):
    def __init__(self, root: Path):
        super().__init__(root)
        self.data_path = self.dist / 'photo-albums.json'
        self.state_path = root / '.local/photo-album-editor.json'

    def read(self):
        import json
        return json.loads(self.data_path.read_text(encoding='utf-8'))

    def optional_caption(self, caption):
        return self.text(caption) if str(caption).strip() else ''

    def upload_photo(self, filename, content, caption=''):
        caption = self.optional_caption(caption)
        if len(content) > 30 * 1024 * 1024:
            raise ValueError('Photo exceeds 30 MB')
        try:
            with Image.open(BytesIO(content)) as image:
                self.validate_image(image)
                image.load()
                clean = ImageOps.exif_transpose(image).convert('RGB')
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise ValueError('Invalid image') from error
        with self.lock:
            data = self.read()
            photo_id = uuid4().hex
            directory = self.dist / 'assets/photo-albums'
            directory.mkdir(parents=True, exist_ok=True)
            paths = {}
            for kind, limit, quality in [('full', max(clean.size), 90), ('screen', 2200, 88), ('thumb', 720, 83)]:
                copy = clean.copy()
                copy.thumbnail((limit, limit), Image.Resampling.LANCZOS)
                path = directory / f'{photo_id}-{kind}.webp'
                copy.save(path, 'WEBP', quality=quality, method=4)
                paths[kind] = path.relative_to(self.dist).as_posix()
            photo = {'id': photo_id, 'filename': str(filename).replace('\\', '/').split('/')[-1][:200],
                     'src': paths['full'], 'screen': paths['screen'], 'thumbnail': paths['thumb'],
                     'width': clean.width, 'height': clean.height, 'caption': caption}
            if caption:
                photo['captionKey'] = self._append_copy(caption)
            data['photos'].append(photo)
            self._json(self.data_path, data)
            return photo

    def save_caption(self, payload):
        caption = self.optional_caption(payload.get('caption', ''))
        with self.lock:
            data = self.read()
            photo = next((p for p in data['photos'] if p['id'] == payload.get('id')), None)
            if photo is None:
                raise ValueError('Unknown photograph')
            photo['caption'] = caption
            photo.pop('captionKey', None)
            if caption:
                photo['captionKey'] = self._append_copy(caption)
            self._json(self.data_path, data)
            return photo

    def save_album(self, payload):
        with self.lock:
            data = self.read()
            album_id = payload.get('id')
            album = next((a for a in data['albums'] if a['id'] == album_id), None)
            if album_id and album is None:
                raise ValueError('Unknown album')
            if album is None:
                album = {'id': uuid4().hex, 'photoIds': [], 'title': self.text(payload.get('title', ''), 200)}
            title = self.text(payload.get('title', album['title']), 200)
            members = payload.get('photoIds', album['photoIds'])
            known = {p['id'] for p in data['photos']}
            if not isinstance(members, list) or any(not isinstance(p, str) or p not in known for p in members):
                raise ValueError('Unknown photograph')
            members = list(dict.fromkeys(members))
            cover = payload.get('coverId', album.get('coverId'))
            if cover not in members:
                cover = members[0] if members else None
            album.update(title=title, photoIds=members, coverId=cover)
            self._append_copy(title)
            if not album_id:
                data['albums'].append(album)
            self._json(self.data_path, data)
            return album

    def delete_album(self, payload):
        with self.lock:
            data = self.read()
            if not any(a['id'] == payload.get('id') for a in data['albums']):
                raise ValueError('Unknown album')
            data['albums'] = [a for a in data['albums'] if a['id'] != payload['id']]
            # Photographs and every historical Markdown entry remain in the pool.
            self._json(self.data_path, data)
