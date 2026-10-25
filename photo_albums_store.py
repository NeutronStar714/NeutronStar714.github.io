"""Album memberships reference a shared pool. Private authoring never ships in dist/."""
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from PIL import Image, ImageOps, UnidentifiedImageError
from photography_store import PhotographyStore


class PhotoAlbumStore(PhotographyStore):
    STRIP_ID = 'main-page-strip'

    def __init__(self, root: Path):
        super().__init__(root)
        self.data_path = self.dist / 'photo-albums.json'
        self.state_path = root / '.local/photo-album-editor.json'

    def read(self):
        import json
        data = json.loads(self.data_path.read_text(encoding='utf-8'))
        if 'stripAlbum' not in data:
            known = {photo['id'] for photo in data['photos']}
            members = list(dict.fromkeys(photo for album in data['albums']
                                         for photo in album['photoIds'] if photo in known))
            data['stripAlbum'] = {'id': self.STRIP_ID, 'title': 'Main page strip', 'photoIds': members}
        return data

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
            pinned = album_id == self.STRIP_ID
            album = data['stripAlbum'] if pinned else next((a for a in data['albums'] if a['id'] == album_id), None)
            if album_id and album is None:
                raise ValueError('Unknown album')
            if album is None:
                album = {'id': uuid4().hex, 'photoIds': [], 'title': self.text(payload.get('title', ''), 200)}
            title = album['title'] if pinned else self.text(payload.get('title', album['title']), 200)
            members = payload.get('photoIds', album['photoIds'])
            known = {p['id'] for p in data['photos']}
            if not isinstance(members, list) or any(not isinstance(p, str) or p not in known for p in members):
                raise ValueError('Unknown photograph')
            members = list(dict.fromkeys(members))
            cover = payload.get('coverId', album.get('coverId'))
            if cover not in members:
                cover = members[0] if members else None
            album.update(title=title, photoIds=members, coverId=cover)
            if pinned:
                album.pop('coverId', None)
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

    def reorder_albums(self, payload):
        with self.lock:
            data = self.read()
            order = payload.get('albumIds')
            known = {album['id']: album for album in data['albums']}
            if (not isinstance(order, list) or any(not isinstance(item, str) for item in order) or
                    len(order) != len(known) or len(set(order)) != len(order) or set(order) != set(known)):
                raise ValueError('Invalid album order')
            data['albums'] = [known[item] for item in order]
            self._json(self.data_path, data)
            return data['albums']

    def delete_photos(self, payload):
        """Remove pool photos and memberships; archive only project image copies."""
        with self.lock:
            data = self.read()
            ids = payload.get('photoIds')
            known = {photo['id']: photo for photo in data['photos']}
            if (not isinstance(ids, list) or not ids or any(not isinstance(item, str) for item in ids) or
                    len(set(ids)) != len(ids) or any(item not in known for item in ids)):
                raise ValueError('Unknown photograph')
            removed = set(ids)
            photos = [known[item] for item in ids]
            kept = [photo for photo in data['photos'] if photo['id'] not in removed]
            fields = ('src', 'screen', 'thumbnail')
            shared_paths = {photo.get(field) for photo in kept for field in fields}
            paths = {photo.get(field) for photo in photos for field in fields} - shared_paths - {None, ''}
            allowed = [(self.dist / 'assets' / name).resolve() for name in ('photo-albums', 'photography')]
            assets = []
            for name in paths:
                path = (self.dist / name).resolve()
                if not any(path.is_relative_to(directory) for directory in allowed):
                    raise ValueError('Invalid photograph path')
                if path.is_file():
                    assets.append(path)
            archive = self.root / '.local/photo-pool-trash' / uuid4().hex
            archive.mkdir(parents=True)
            self._json(archive / 'record.json', {'photos': photos, 'albums': data['albums'], 'stripAlbum': data['stripAlbum']})
            moved = []
            try:
                for path in assets:
                    target = archive / path.relative_to(self.dist)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    path.rename(target)
                    moved.append((path, target))
                data['photos'] = kept
                for album in [data['stripAlbum'], *data['albums']]:
                    album['photoIds'] = [item for item in album['photoIds'] if item not in removed]
                    if album.get('coverId') in removed:
                        album['coverId'] = next(iter(album['photoIds']), None)
                self._json(self.data_path, data)
            except OSError:
                for path, target in reversed(moved):
                    target.rename(path)
                raise
            # Caption entries in website-text.md and external originals are untouched.
            return {'photoIds': ids, 'albums': data['albums'], 'stripAlbum': data['stripAlbum']}
