"""Exercise uploads and the private editor against an isolated, temporary website."""
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

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from photography_store import PhotographyStore

spec = importlib.util.spec_from_file_location("preview_server", ROOT / "preview-server.py")
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class EditorTests(unittest.TestCase):
    def setUp(self):
        self.test_root = ROOT / '.local' / 'photography-tests'
        self.test_root.mkdir(parents=True, exist_ok=True)
        self.temporary = TemporaryDirectory(dir=self.test_root)
        self.root = Path(self.temporary.name)
        (self.root / "dist").mkdir()
        (self.root / "tools").mkdir()
        (self.root / "tools" / "photography-editor.html").write_text("Private editor", encoding="utf-8")
        (self.root / "dist" / "photography.json").write_text(json.dumps({
            "version": 1, "places": [{"id": "test", "name": "A place", "lat": 32, "lng": 118}], "photos": []
        }), encoding="utf-8")
        self.original = b"# Website text\n\n### `manual.words`\n\n```text\nMy own writing.\n```\n"
        (self.root / "website-text.md").write_bytes(self.original)
        self.store = PhotographyStore(self.root)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(preview.MediaHandler, directory=str(self.root / 'dist')))
        self.server.photo_store = self.store
        self.server.editor_token = 'test-token'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        assert self.root.resolve().is_relative_to(self.test_root.resolve()) and self.root.resolve() != self.test_root.resolve()
        self.temporary.cleanup()

    def request(self, path, method='GET', body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        status, content = response.status, response.read()
        connection.close()
        return status, content

    def headers(self, content_type='application/json'):
        return {'Origin': f'http://127.0.0.1:{self.server.server_port}',
                'X-Photo-Editor-Token': 'test-token', 'Content-Type': content_type}

    def multipart(self, content, caption='A photograph from a walk'):
        boundary = 'test-photo-boundary'
        chunks = []
        for name, value in [('placeId', b'test'), ('caption', caption.encode()), ('file', content)]:
            filename = '; filename="../../escape.jpg"' if name == 'file' else ''
            media_type = '\r\nContent-Type: image/jpeg' if name == 'file' else ''
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"{filename}{media_type}\r\n\r\n'.encode() + value + b'\r\n')
        chunks.append(f'--{boundary}--\r\n'.encode())
        return b''.join(chunks), self.headers(f'multipart/form-data; boundary={boundary}')

    def test_archive_disables_routes_and_reactivation_preserves_data(self):
        self.assertEqual(self.request('/__photo-editor')[0], 404)
        self.store.set_enabled(True)
        self.assertEqual(self.request('/__photo-editor')[0], 200)
        self.assertEqual(self.request('/__photo-editor/config')[0], 200)
        self.assertEqual(self.request('/__photo-editor/archive', 'POST', b'{}', self.headers())[0], 200)
        self.assertEqual(self.request('/__photo-editor')[0], 404)
        self.assertEqual(self.request('/__photo-editor/config')[0], 404)
        self.assertEqual(self.request('/__photo-editor/places', 'POST', b'{}', self.headers())[0], 404)
        self.assertEqual(len(self.store.read()['places']), 1)
        self.store.set_enabled(True)
        self.assertEqual(self.request('/__photo-editor/config')[0], 200)
        self.assertEqual(self.request('/tools/photography-editor.html')[0], 404)

    def test_origin_token_and_input_validation(self):
        self.store.set_enabled(True)
        body = json.dumps({'name': 'New place', 'lat': 32, 'lng': 118}).encode()
        self.assertEqual(self.request('/__photo-editor/places', 'POST', body, {'Content-Type': 'application/json'})[0], 403)
        headers = self.headers()
        headers['Origin'] = 'https://another.example'
        self.assertEqual(self.request('/__photo-editor/places', 'POST', body, headers)[0], 403)
        invalid = json.dumps({'name': 'Bad location', 'lat': 100, 'lng': 118}).encode()
        self.assertEqual(self.request('/__photo-editor/places', 'POST', invalid, self.headers())[0], 422)
        invalid_file, headers = self.multipart(b'<svg onload="alert(1)"></svg>')
        self.assertEqual(self.request('/__photo-editor/photos', 'POST', invalid_file, headers)[0], 422)
        self.assertEqual((self.root / 'website-text.md').read_bytes(), self.original)

    def test_upload_is_published_with_caption_and_full_dimensions(self):
        self.store.set_enabled(True)
        image = BytesIO()
        Image.new('RGB', (640, 480), '#9fbbac').save(image, 'JPEG')
        body, headers = self.multipart(image.getvalue())
        status, content = self.request('/__photo-editor/photos', 'POST', body, headers)
        self.assertEqual(status, 201)
        photo = json.loads(content)['photo']
        self.assertEqual((photo['width'], photo['height']), (640, 480))
        self.assertTrue(photo['src'].startswith('assets/photography/'))
        self.assertNotIn('escape', photo['src'])
        status, jpeg = self.request('/' + photo['src'])
        self.assertEqual(status, 200)
        self.assertEqual(Image.open(BytesIO(jpeg)).size, (640, 480))
        markdown = (self.root / 'website-text.md').read_bytes()
        self.assertTrue(markdown.startswith(self.original))
        self.assertIn(b'A photograph from a walk', markdown)
        self.assertEqual(markdown, (self.root / 'dist/website-text.md').read_bytes())
        self.assertEqual(self.request('/website-text.md'), (200, markdown))
        self.assertEqual(len(self.store.read()['photos']), 1)
        self.assertFalse((self.root / 'escape.jpg').exists())

    def test_camera_resolution_upload_and_specific_validation_errors(self):
        self.store.set_enabled(True)
        image = BytesIO()
        Image.new('RGB', (6192, 4128), '#283547').save(image, 'JPEG')
        body, headers = self.multipart(image.getvalue())
        status, content = self.request('/__photo-editor/photos', 'POST', body, headers)
        self.assertEqual(status, 201, content)
        photo = json.loads(content)['photo']
        self.assertEqual((photo['width'], photo['height']), (6192, 4128))
        for binary, caption, code in [(b'not an image', 'A caption', 'image-error'),
                                      (image.getvalue(), ' ', 'text-error')]:
            body, headers = self.multipart(binary, caption)
            status, content = self.request('/__photo-editor/photos', 'POST', body, headers)
            self.assertEqual(status, 422)
            self.assertEqual(json.loads(content)['code'], code)
        self.assertEqual(len(self.store.read()['photos']), 1)

    def test_editing_a_place_appends_new_copy_and_keeps_old_entry(self):
        self.store.save_place({'id': 'test', 'name': 'First wording', 'lat': 32, 'lng': 118})
        prior = (self.root / 'website-text.md').read_bytes()
        self.store.save_place({'id': 'test', 'name': 'Revised wording', 'lat': 33, 'lng': 119})
        current = (self.root / 'website-text.md').read_bytes()
        self.assertTrue(current.startswith(prior))
        self.assertIn(b'First wording', current)
        self.assertIn(b'Revised wording', current)
        self.assertEqual(len(self.store.read()['places']), 1)
        self.assertEqual(self.store.read()['places'][0]['lat'], 33)

    def test_story_round_trip_preserves_markdown_and_publishes_optional_sections(self):
        self.store.set_enabled(True)
        image = BytesIO()
        Image.new('RGB', (640, 480), '#9fbbac').save(image, 'JPEG')
        photo = self.store.upload('test', 'An original caption', image.getvalue())
        before = (self.root / 'website-text.md').read_bytes()
        story = {'title':'A photograph title', 'quote':'An attributed quotation',
                 'quoteCredit':'The speaker', 'context':'My own account.\n\nA second paragraph.',
                 'extract':'Original field notes.', 'credit':'Photographer name',
                 'documentary':{'src':'musicsources/original-extract.mp4', 'title':'An original extract'},
                 'sources':[{'title':'A historical source','url':'https://example.org/archive'}]}
        body = json.dumps({'photoId':photo['id'], 'story':story}).encode()
        status, content = self.request('/__photo-editor/stories', 'POST', body, self.headers())
        self.assertEqual(status, 200, content)
        published = self.store.read()['photos'][0]
        self.assertEqual(published['context'], story['context'])
        self.assertEqual(published['documentary']['kind'], 'video')
        self.assertEqual(published['sources'], story['sources'])
        current = (self.root / 'website-text.md').read_bytes()
        self.assertTrue(current.startswith(before))
        self.assertIn(b'A second paragraph.', current)
        self.store.save_story(photo['id'], {'context':'Revised account.'})
        self.assertTrue((self.root / 'website-text.md').read_bytes().startswith(current))
        self.assertEqual(self.store.read()['photos'][0]['caption'], 'An original caption')

    def test_story_rejects_executable_links_without_changing_data(self):
        before = (self.root / 'website-text.md').read_bytes()
        for story in [{'sources':[{'title':'Bad','url':'javascript:alert(1)'}]},
                      {'documentary':{'src':'../../private.mp4'}}]:
            with self.assertRaises(ValueError):
                self.store.story_details(story)
        self.assertEqual((self.root / 'website-text.md').read_bytes(), before)

    def gps_photo(self, gps=None):
        image = BytesIO()
        exif = Image.Exif()
        if gps is not None:
            exif[34853] = gps
        Image.new('RGB', (32, 24), '#9fbbac').save(image, 'JPEG', exif=exif)
        return image.getvalue()

    def test_gps_inspection_is_private_and_does_not_publish_anything(self):
        content = self.gps_photo({1: 'N', 2: (27., 0., 36.), 3: 'E', 4: (100., 12., 0.)})
        self.assertEqual(self.request('/__photo-editor/metadata', 'POST', content, self.headers())[0], 404)
        self.store.set_enabled(True)
        self.assertEqual(self.request('/__photo-editor/metadata', 'POST', content)[0], 403)
        status, result = self.request('/__photo-editor/metadata', 'POST', content, self.headers('application/octet-stream'))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(result), {'location': {'lat': 27.01, 'lng': 100.2}, 'width': 32, 'height': 24, 'format': 'JPEG'})
        self.assertEqual(self.store.read()['photos'], [])
        self.assertEqual((self.root / 'website-text.md').read_bytes(), self.original)
        self.assertFalse((self.root / 'dist/assets').exists())

    def test_gps_handles_signs_missing_and_invalid_tags_without_guessing(self):
        for gps, expected in [
            ({1: 'S', 2: (33., 30., 0.), 3: 'W', 4: (70., 15., 0.)}, {'lat': -33.5, 'lng': -70.25}),
            ({1: 'N', 2: (0., 0., 0.), 3: 'E', 4: (0., 0., 0.)}, {'lat': 0., 'lng': 0.}),
            (None, None),
            ({1: 'N', 2: (27., 0., 0.)}, None),
            ({1: 'N', 2: (91., 0., 0.), 3: 'E', 4: (100., 0., 0.)}, None),
            ({1: 'N', 2: (27., 60., 0.), 3: 'E', 4: (100., 0., 0.)}, None),
        ]:
            with self.subTest(gps=gps):
                self.assertEqual(self.store.inspect_photo(self.gps_photo(gps))['location'], expected)

    def test_manual_pin_can_override_camera_gps_and_public_jpeg_has_no_exif(self):
        self.store.set_enabled(True)
        content = self.gps_photo({1: 'N', 2: (27., 0., 0.), 3: 'E', 4: (100., 0., 0.)})
        self.store.save_place({'id': 'test', 'name': 'My chosen location', 'lat': 32.07, 'lng': 118.81})
        body, headers = self.multipart(content)
        status, result = self.request('/__photo-editor/photos', 'POST', body, headers)
        self.assertEqual(status, 201)
        photo = json.loads(result)['photo']
        self.assertEqual(photo['placeId'], 'test')
        self.assertEqual(self.store.read()['places'][0]['lat'], 32.07)
        with Image.open(self.root / 'dist' / photo['src']) as published:
            self.assertFalse(published.getexif())

    def test_photos_have_independent_coordinates_and_never_create_named_places(self):
        content = self.gps_photo({1: 'N', 2: (27., 0., 36.), 3: 'E', 4: (100., 12., 0.)})
        automatic = self.store.upload('test', 'GPS photograph', content)
        manual = self.store.upload('test', 'Manual photograph', content, coordinates={'lat': 32.1, 'lng': 118.9})
        missing = self.store.upload('test', 'Unlocated photograph', self.gps_photo())
        self.assertEqual(automatic['coordinates'], {'lat': 27.01, 'lng': 100.2, 'source': 'gps'})
        self.assertEqual(manual['coordinates'], {'lat': 32.1, 'lng': 118.9, 'source': 'manual'})
        self.assertIsNone(missing['coordinates'])
        self.assertEqual(len(self.store.read()['places']), 1)

    def test_camera_mpo_jpeg_upload_preserves_primary_frame_and_dimensions(self):
        self.store.set_enabled(True)
        content = BytesIO()
        Image.new('RGB', (640, 480), 'red').save(content, 'MPO', save_all=True,
            append_images=[Image.new('RGB', (640, 480), 'blue')])
        binary = content.getvalue()
        with Image.open(BytesIO(binary)) as camera:
            self.assertEqual(camera.format, 'MPO')
            self.assertEqual(camera.n_frames, 2)
        status, metadata = self.request('/__photo-editor/metadata', 'POST', binary, self.headers('application/octet-stream'))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(metadata)['format'], 'MPO')
        body, headers = self.multipart(binary, 'A camera photograph')
        status, result = self.request('/__photo-editor/photos', 'POST', body, headers)
        self.assertEqual(status, 201, result)
        photo = json.loads(result)['photo']
        with Image.open(self.root / 'dist' / photo['src']) as published:
            self.assertEqual(published.format, 'JPEG')
            self.assertEqual(published.size, (640, 480))
            red, _, blue = published.getpixel((320, 240))
            self.assertGreater(red, 240)
            self.assertLess(blue, 10)
            self.assertEqual(getattr(published, 'n_frames', 1), 1)

    def test_additional_photo_formats_and_specific_unsupported_format_error(self):
        for kind in ['TIFF', 'AVIF', 'BMP']:
            with self.subTest(kind=kind):
                content = BytesIO()
                Image.new('RGB', (40, 30), '#9fbbac').save(content, kind)
                self.assertEqual(self.store.inspect_photo(content.getvalue())['format'], kind)
                photo = self.store.upload('test', kind + ' photograph', content.getvalue())
                self.assertEqual((photo['width'], photo['height']), (40, 30))
        self.store.set_enabled(True)
        content = BytesIO()
        Image.new('RGB', (40, 30)).save(content, 'GIF')
        body, headers = self.multipart(content.getvalue())
        before = (self.root / 'website-text.md').read_bytes()
        status, result = self.request('/__photo-editor/photos', 'POST', body, headers)
        self.assertEqual(status, 422)
        self.assertEqual(json.loads(result)['format'], 'GIF')
        self.assertEqual((self.root / 'website-text.md').read_bytes(), before)

    def test_named_hierarchy_rename_reparent_move_and_deletion_preserve_photos(self):
        other = self.store.save_place({'name': 'Other region', 'level': 'region', 'lat': 30, 'lng': 110})
        child = self.store.save_place({'name': 'Old City', 'level': 'location', 'parentId': 'test', 'lat': 32, 'lng': 118})
        photo = self.store.upload(child['id'], 'My own caption', self.gps_photo(), coordinates={'lat': 32.03, 'lng': 118.02})
        before = (self.root / 'website-text.md').read_bytes()
        self.store.save_place({'id': child['id'], 'name': 'Renamed location', 'level': 'location', 'parentId': other['id'], 'lat': 31, 'lng': 117})
        self.assertEqual(self.store.read()['photos'][0]['coordinates'], photo['coordinates'])
        self.store.delete_place({'id': child['id']})
        self.assertEqual(self.store.read()['photos'][0]['placeId'], other['id'])
        with self.assertRaisesRegex(ValueError, 'Reassignment required'):
            self.store.delete_place({'id': other['id']})
        self.store.delete_place({'id': other['id'], 'targetId': 'test'})
        saved = self.store.read()['photos'][0]
        self.assertEqual(saved['coordinates'], photo['coordinates'])
        self.assertEqual(saved['placeId'], 'test')
        self.assertTrue((self.root / 'dist' / saved['src']).exists())
        self.assertTrue((self.root / 'website-text.md').read_bytes().startswith(before))

    def test_region_delete_reparents_locations_and_saved_photo_can_be_relocated(self):
        self.store.set_enabled(True)
        child = self.store.save_place({'name': 'A location', 'level': 'location', 'parentId': 'test', 'lat': 32, 'lng': 118})
        other = self.store.save_place({'name': 'Target region', 'lat': 31, 'lng': 117})
        photo = self.store.upload(child['id'], 'Original wording', self.gps_photo())
        status, _ = self.request('/__photo-editor/delete-place', 'POST', json.dumps({'id': 'test', 'targetId': other['id']}).encode(), self.headers())
        self.assertEqual(status, 200)
        self.assertEqual(next(p for p in self.store.read()['places'] if p['id'] == child['id'])['parentId'], other['id'])
        before = (self.root / 'website-text.md').read_bytes()
        payload = {'id': photo['id'], 'placeId': other['id'], 'caption': 'Revised wording', 'coordinates': {'lat': 31.1, 'lng': 117.1}}
        status, result = self.request('/__photo-editor/photo-details', 'POST', json.dumps(payload).encode(), self.headers())
        self.assertEqual(status, 200, result)
        saved = json.loads(result)['photo']
        self.assertEqual(saved['coordinates']['lat'], 31.1)
        self.assertTrue((self.root / 'website-text.md').read_bytes().startswith(before))
        for parent in [child['id'], 'missing']:
            with self.assertRaisesRegex(ValueError, 'Invalid hierarchy'):
                self.store.save_place({'name': 'Invalid child', 'level': 'location', 'parentId': parent, 'lat': 32, 'lng': 118})


if __name__ == '__main__':
    unittest.main()
