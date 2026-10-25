"""Verify album persistence, optional captions and the local editor boundary."""
import functools
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import patch
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from photo_albums_store import PhotoAlbumStore
from photography_store import PhotographyStore
spec = importlib.util.spec_from_file_location('preview_albums', ROOT / 'preview-server.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class AlbumTests(unittest.TestCase):
    def setUp(self):
        directory = ROOT / '.local/album-tests'
        directory.mkdir(parents=True, exist_ok=True)
        self.temp = TemporaryDirectory(dir=directory)
        self.root = Path(self.temp.name)
        (self.root / 'dist').mkdir()
        (self.root / 'tools').mkdir()
        (self.root / 'tools/photo-album-editor.html').write_text('Local album editor', encoding='utf-8')
        (self.root / 'dist/photo-albums.json').write_text(json.dumps({'version': 1, 'photos': [], 'albums': []}))
        self.original = b'# Website text\n\nManual writing must survive.\n'
        (self.root / 'website-text.md').write_bytes(self.original)
        self.store = PhotoAlbumStore(self.root)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(preview.MediaHandler, directory=str(self.root/'dist')))
        self.server.album_store = self.store
        self.server.photo_store = PhotographyStore(self.root)
        self.server.editor_token = 'isolated-test-token'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.temp.cleanup()

    def request(self, path, method='GET', body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def headers(self):
        return {'Content-Type': 'application/json', 'Origin': f'http://127.0.0.1:{self.server.server_port}',
                'X-Photo-Editor-Token': self.server.editor_token}

    def upload(self, caption=''):
        buffer = BytesIO(); Image.new('RGB', (320, 200), '#42758a').save(buffer, 'JPEG')
        return self.store.upload_photo('sample.jpg', buffer.getvalue(), caption)

    def test_optional_captions_and_derivatives(self):
        photo = self.upload()
        self.assertEqual(photo['caption'], '')
        for key in ['src', 'screen', 'thumbnail']:
            with Image.open(self.root / 'dist' / photo[key]) as image:
                self.assertEqual(image.size, (320, 200))
        self.store.save_caption({'id': photo['id'], 'caption': 'My optional caption'})
        before = (self.root / 'website-text.md').read_bytes()
        self.store.save_caption({'id': photo['id'], 'caption': ''})
        self.assertEqual(self.store.read()['photos'][0]['caption'], '')
        self.assertEqual(before, (self.root / 'website-text.md').read_bytes())
        self.assertTrue(before.startswith(self.original))

    def test_membership_is_shared_not_moved_and_order_persists(self):
        first, second = self.upload(), self.upload()
        a = self.store.save_album({'title': 'First album', 'photoIds': [first['id'], second['id']]})
        b = self.store.save_album({'title': 'Another album', 'photoIds': [first['id'], first['id']]})
        self.assertEqual(b['photoIds'], [first['id']])
        self.store.save_album({'id': a['id'], 'photoIds': [second['id'], first['id']], 'coverId': second['id']})
        persisted = PhotoAlbumStore(self.root).read()
        self.assertEqual(persisted['albums'][0]['photoIds'], [second['id'], first['id']])
        self.store.save_album({'id': a['id'], 'photoIds': [second['id']]})
        self.assertEqual(self.store.read()['albums'][1]['photoIds'], [first['id']])
        self.store.delete_album({'id': a['id']})
        self.assertEqual(len(self.store.read()['photos']), 2)
        self.assertIn(b['id'], [a['id'] for a in self.store.read()['albums']])
        self.assertTrue((self.root / 'website-text.md').read_bytes().startswith(self.original))

    def test_invalid_membership_does_not_replace_data(self):
        before = self.store.data_path.read_bytes()
        for members in [['missing'], [{'unexpected': 'object'}], 'wrong']:
            with self.assertRaises(ValueError):
                self.store.save_album({'title': 'Invalid', 'photoIds': members})
        self.assertEqual(before, self.store.data_path.read_bytes())

    def test_pinned_strip_is_independent_persistent_and_can_be_empty(self):
        first, second = self.upload(), self.upload()
        normal = self.store.save_album({'title': 'Ordinary album', 'photoIds': [first['id']]})
        strip = self.store.save_album({'id': self.store.STRIP_ID, 'photoIds': [second['id'], first['id']]})
        self.assertEqual(strip['photoIds'], [second['id'], first['id']])
        self.assertNotIn('coverId', strip)
        self.assertEqual(PhotoAlbumStore(self.root).read()['albums'], [normal])
        self.store.save_album({'id': strip['id'], 'photoIds': [], 'title': 'Cannot rename pinned control'})
        saved = PhotoAlbumStore(self.root).read()
        self.assertEqual(saved['stripAlbum']['photoIds'], [])
        self.assertEqual(saved['stripAlbum']['title'], 'Main page strip')
        self.assertEqual(len(saved['photos']), 2)
        self.assertEqual(saved['albums'], [normal])
        before = self.store.data_path.read_bytes()
        with self.assertRaises(ValueError):
            self.store.delete_album({'id': strip['id']})
        with self.assertRaises(ValueError):
            self.store.reorder_albums({'albumIds': [strip['id'], normal['id']]})
        self.assertEqual(before, self.store.data_path.read_bytes())

    def test_existing_strip_migrates_once_and_pool_deletion_cleans_it(self):
        first, second = self.upload(), self.upload()
        self.store.save_album({'title': 'First', 'photoIds': [first['id'], second['id']]})
        self.store.save_album({'title': 'Second', 'photoIds': [first['id']]})
        data = self.store.read(); data.pop('stripAlbum')
        self.store._json(self.store.data_path, data)
        self.assertEqual(self.store.read()['stripAlbum']['photoIds'], [first['id'], second['id']])
        self.store.save_album({'id': self.store.STRIP_ID, 'photoIds': [second['id'], first['id']]})
        self.store.delete_photos({'photoIds': [first['id']]})
        self.assertEqual(PhotoAlbumStore(self.root).read()['stripAlbum']['photoIds'], [second['id']])
        self.store.save_album({'title': 'Later album', 'photoIds': [second['id']]})
        self.assertEqual(self.store.read()['stripAlbum']['photoIds'], [second['id']])

    def test_local_boundary_archive_and_reactivation(self):
        self.assertEqual(self.request('/__album-editor')[0], 404)
        self.store.set_enabled(True)
        self.assertEqual(self.request('/__album-editor')[0], 200)
        self.assertEqual(self.request('/__photo-editor')[0], 302)
        self.assertEqual(self.request('/__album-editor/album', 'POST', b'{"title":"Unauthorized"}')[0], 403)
        bad = self.headers(); bad['Origin'] = 'https://unrelated.example'
        self.assertEqual(self.request('/__album-editor/album', 'POST', b'{"title":"Unauthorized"}', bad)[0], 403)
        self.assertEqual(self.request('/__album-editor/album', 'POST', b'{"title":"Saved album"}', self.headers())[0], 200)
        before = self.store.read()
        self.assertEqual(self.request('/__album-editor/archive', 'POST', b'{}', self.headers())[0], 200)
        self.assertEqual(self.request('/__album-editor/data')[0], 404)
        self.assertEqual(self.request('/__album-editor/album', 'POST', b'{}', self.headers())[0], 404)
        self.store.set_enabled(True)
        self.assertEqual(self.store.read(), before)

    def test_http_upload_without_place_or_caption(self):
        self.store.set_enabled(True)
        buffer = BytesIO(); Image.new('RGB', (120, 180), '#a34a56').save(buffer, 'JPEG')
        boundary = 'album-test-boundary'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="camera.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode()
                + buffer.getvalue() + f'\r\n--{boundary}--\r\n'.encode())
        headers = self.headers(); headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        status, content = self.request('/__album-editor/upload', 'POST', body, headers)
        self.assertEqual(status, 201, content)
        self.assertEqual(json.loads(content)['photo']['caption'], '')

    def test_delete_from_pool_removes_shared_memberships_and_repairs_covers(self):
        first, second = self.upload('Caption kept in Markdown'), self.upload()
        self.store.save_album({'title': 'Shared', 'photoIds': [first['id'], second['id']], 'coverId': first['id']})
        self.store.save_album({'title': 'Single', 'photoIds': [first['id']]})
        before = (self.root / 'website-text.md').read_bytes()
        self.store.set_enabled(True)
        status, body = self.request('/__album-editor/delete-photos', 'POST',
                                    json.dumps({'photoIds': [first['id']]}), self.headers())
        self.assertEqual(status, 200, body)
        saved = PhotoAlbumStore(self.root).read()
        self.assertEqual([p['id'] for p in saved['photos']], [second['id']])
        self.assertEqual(saved['albums'][0]['photoIds'], [second['id']])
        self.assertEqual(saved['albums'][0]['coverId'], second['id'])
        self.assertEqual(saved['albums'][1]['photoIds'], [])
        self.assertIsNone(saved['albums'][1]['coverId'])
        self.assertEqual((self.root / 'website-text.md').read_bytes(), before)
        for field in ('src', 'screen', 'thumbnail'):
            self.assertFalse((self.root / 'dist' / first[field]).exists())
            self.assertTrue((self.root / 'dist' / second[field]).exists())
            self.assertTrue(list((self.root / '.local/photo-pool-trash').glob('*/' + first[field])))

    def test_album_order_is_exact_persistent_and_does_not_change_memberships(self):
        photo = self.upload()
        a = self.store.save_album({'title': 'One', 'photoIds': [photo['id']]})
        b = self.store.save_album({'title': 'Two'})
        self.store.set_enabled(True)
        before = (self.root / 'website-text.md').read_bytes()
        status, body = self.request('/__album-editor/album-order', 'POST',
                                    json.dumps({'albumIds': [b['id'], a['id']]}), self.headers())
        self.assertEqual(status, 200, body)
        self.assertEqual(PhotoAlbumStore(self.root).read()['albums'], [b, a])
        saved = self.store.data_path.read_bytes()
        for ids in [[a['id']], [a['id'], a['id']], ['missing', a['id']], [a['id'], {}]]:
            with self.assertRaises(ValueError):
                self.store.reorder_albums({'albumIds': ids})
            self.assertEqual(saved, self.store.data_path.read_bytes())
        self.assertEqual(before, (self.root / 'website-text.md').read_bytes())

    def test_delete_validates_all_ids_and_paths_before_changing_anything(self):
        photo = self.upload()
        saved = self.store.data_path.read_bytes()
        for ids in [[], [photo['id'], 'missing'], [photo['id'], photo['id']], [{}]]:
            with self.assertRaises(ValueError):
                self.store.delete_photos({'photoIds': ids})
            self.assertEqual(saved, self.store.data_path.read_bytes())
        original = self.root / 'original.jpg'
        original.write_bytes(b'External original must be unchanged')
        data = self.store.read(); data['photos'][0]['src'] = '../original.jpg'
        self.store._json(self.store.data_path, data)
        with self.assertRaisesRegex(ValueError, 'Invalid photograph path'):
            self.store.delete_photos({'photoIds': [photo['id']]})
        self.assertEqual(original.read_bytes(), b'External original must be unchanged')

    def test_failed_data_write_restores_archived_image_files(self):
        photo = self.upload('Keep this caption')
        saved = self.store.data_path.read_bytes()
        write = self.store._json
        def fail_data_write(path, value):
            if path == self.store.data_path:
                raise OSError('Simulated write failure')
            write(path, value)
        with patch.object(self.store, '_json', side_effect=fail_data_write):
            with self.assertRaises(OSError):
                self.store.delete_photos({'photoIds': [photo['id']]})
        self.assertEqual(saved, self.store.data_path.read_bytes())
        for field in ('src', 'screen', 'thumbnail'):
            self.assertTrue((self.root / 'dist' / photo[field]).is_file())

if __name__ == '__main__':
    unittest.main()
