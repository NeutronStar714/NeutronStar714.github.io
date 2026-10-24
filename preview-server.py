"""Local static preview with HTTP byte ranges for audio seeking."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from email import policy
from email.parser import BytesParser
import hmac
import json
import re
import secrets
from urllib.parse import urlsplit
from photography_store import PhotographyStore
from photo_albums_store import PhotoAlbumStore

ROOT = Path(__file__).resolve().parent
PHOTO_STORE = PhotographyStore(ROOT)
ALBUM_STORE = PhotoAlbumStore(ROOT)
EDITOR_TOKEN = secrets.token_urlsafe(32)

class MediaHandler(SimpleHTTPRequestHandler):
    def album_editor_allowed(self):
        if not hasattr(self.server, 'album_store'):
            return False
        host = self.headers.get('Host', '')
        return (self.client_address[0] in {'127.0.0.1', '::1'} and
                host in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'} and
                getattr(self.server, 'album_store', ALBUM_STORE).enabled())

    def editor_allowed(self):
        host = self.headers.get('Host', '')
        return (self.client_address[0] in {'127.0.0.1', '::1'} and
                host in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'} and
                self.server.photo_store.enabled())

    def send_json(self, value, status=200):
        content = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def send_head(self):
        route = urlsplit(self.path).path
        if route == '/__photo-editor' and self.album_editor_allowed():
            self.send_response(302)
            self.send_header('Location', '/__album-editor')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        if route.startswith('/__album-editor'):
            if not self.album_editor_allowed():
                self.send_error(404)
                return None
            import io
            if route in {'/__album-editor/config', '/__album-editor/data'}:
                value = ({'token': self.server.editor_token} if route.endswith('/config') else
                         getattr(self.server, 'album_store', ALBUM_STORE).read())
                payload = json.dumps(value, ensure_ascii=False).encode('utf-8')
                content_type = 'application/json; charset=utf-8'
            else:
                files = {'/__album-editor': 'photo-album-editor.html',
                         '/__album-editor/editor.js': 'photo-album-editor.js',
                         '/__album-editor/editor.css': 'photo-album-editor.css'}
                if route not in files:
                    self.send_error(404)
                    return None
                path = getattr(self.server, 'album_store', ALBUM_STORE).root / 'tools' / files[route]
                payload, content_type = path.read_bytes(), self.guess_type(str(path))
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return io.BytesIO(payload)
        if route.startswith('/__photo-editor'):
            if not self.editor_allowed():
                self.send_error(404)
                return None
            if route == '/__photo-editor/config':
                import io
                payload = json.dumps({'token': self.server.editor_token}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                return io.BytesIO(payload)
            files = {'/__photo-editor': 'photography-editor.html',
                     '/__photo-editor/editor.js': 'photography-editor.js',
                     '/__photo-editor/editor.css': 'photography-editor.css'}
            if route not in files:
                self.send_error(404)
                return None
            import io
            path = self.server.photo_store.root / 'tools' / files[route]
            payload = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(path)))
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return io.BytesIO(payload)
        return self.send_media_head()

    def do_POST(self):
        route = urlsplit(self.path).path
        if route.startswith('/__album-editor/'):
            return self.album_post(route)
        if not route.startswith('/__photo-editor/') or not self.editor_allowed():
            self.send_error(404)
            return
        expected_origin = 'http://' + self.headers.get('Host', '')
        if (self.headers.get('Origin') != expected_origin or
                not hmac.compare_digest(self.headers.get('X-Photo-Editor-Token', ''), self.server.editor_token)):
            self.send_json({'error': 'Unauthorized editor request', 'code': 'session-error'}, 403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 31 * 1024 * 1024:
                self.send_json({'error': 'Invalid upload size', 'code': 'size-error'}, 413)
                return
            content = self.rfile.read(size)
            if route == '/__photo-editor/metadata':
                self.send_json(self.server.photo_store.inspect_photo(content))
            elif route == '/__photo-editor/places':
                place = self.server.photo_store.save_place(json.loads(content))
                self.send_json({'place': place}, 201)
            elif route == '/__photo-editor/delete-place':
                self.server.photo_store.delete_place(json.loads(content))
                self.send_json({'deleted': True})
            elif route == '/__photo-editor/photo-details':
                photo = self.server.photo_store.save_photo(json.loads(content))
                self.send_json({'photo': photo})
            elif route == '/__photo-editor/photos':
                content_type = self.headers.get('Content-Type', '')
                if not content_type.startswith('multipart/form-data;'):
                    raise ValueError('Expected multipart upload')
                message = BytesParser(policy=policy.default).parsebytes(
                    b'Content-Type: ' + content_type.encode('ascii') + b'\r\nMIME-Version: 1.0\r\n\r\n' + content)
                fields = {}
                for part in message.iter_parts():
                    name = part.get_param('name', header='content-disposition')
                    if name in fields:
                        raise ValueError('Duplicate field')
                    fields[name] = part.get_payload(decode=True)
                photo = self.server.photo_store.upload(fields['placeId'].decode('utf-8'),
                    fields['caption'].decode('utf-8'), fields['file'],
                    json.loads(fields.get('story', b'{}')),
                    json.loads(fields['coordinates']) if 'coordinates' in fields else 'auto')
                self.send_json({'photo': photo}, 201)
            elif route == '/__photo-editor/stories':
                payload = json.loads(content)
                photo = self.server.photo_store.save_story(payload['photoId'], payload.get('story', {}))
                self.send_json({'photo': photo})
            elif route == '/__photo-editor/archive':
                self.server.photo_store.set_enabled(False)
                self.send_json({'archived': True})
            else:
                self.send_error(404)
        except (ValueError, KeyError, TypeError, UnicodeError) as error:
            self.log_error('Editor request rejected (%s): %s; detected format=%s', route, error, getattr(error, 'image_format', None))
            code = {'Photo exceeds 30 MB': 'size-error',
                    'Photo exceeds 60 megapixels': 'resolution-error',
                    'Unsupported image': 'format-error', 'Invalid image': 'image-error',
                    'Unknown place': 'place-error', 'Invalid text': 'text-error',
                    'Invalid coordinates': 'coordinate-error',
                    'Invalid hierarchy': 'hierarchy-error', 'Reassignment required': 'reassignment-error',
                    'Invalid story': 'story-error', 'Invalid sources': 'story-error',
                    'Invalid source URL': 'story-error', 'Invalid documentary URL': 'story-error',
                    'Unknown photograph': 'story-error'}.get(str(error), 'upload-error')
            self.send_json({'error': 'Invalid place or photograph', 'code': code,
                            'format': getattr(error, 'image_format', None)}, 422)
        except OSError as error:
            self.log_error('Editor storage failed (%s): %s', route, error)
            self.send_json({'error': 'Could not write photography files', 'code': 'storage-error'}, 500)

    def album_post(self, route):
        if not self.album_editor_allowed():
            self.send_error(404)
            return
        if (self.headers.get('Origin') != 'http://' + self.headers.get('Host', '') or
                not hmac.compare_digest(self.headers.get('X-Photo-Editor-Token', ''), self.server.editor_token)):
            self.send_json({'error': 'Refresh the editor and try again.'}, 403)
            return
        store = getattr(self.server, 'album_store', ALBUM_STORE)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 31 * 1024 * 1024:
                raise ValueError('Photo exceeds 30 MB')
            content = self.rfile.read(size)
            if route == '/__album-editor/upload':
                content_type = self.headers.get('Content-Type', '')
                if not content_type.startswith('multipart/form-data;'):
                    raise ValueError('Expected a photograph upload')
                message = BytesParser(policy=policy.default).parsebytes(
                    b'Content-Type: ' + content_type.encode('ascii') + b'\r\nMIME-Version: 1.0\r\n\r\n' + content)
                fields, filename = {}, 'photograph'
                for part in message.iter_parts():
                    name = part.get_param('name', header='content-disposition')
                    if name in fields:
                        raise ValueError('Duplicate upload field')
                    fields[name] = part.get_payload(decode=True)
                    if name == 'file':
                        filename = part.get_filename() or filename
                photo = store.upload_photo(filename, fields['file'], fields.get('caption', b'').decode('utf-8'))
                self.send_json({'photo': photo}, 201)
            elif route == '/__album-editor/caption':
                self.send_json({'photo': store.save_caption(json.loads(content))})
            elif route == '/__album-editor/album':
                self.send_json({'album': store.save_album(json.loads(content))})
            elif route == '/__album-editor/delete-album':
                store.delete_album(json.loads(content))
                self.send_json({'deleted': True})
            elif route == '/__album-editor/archive':
                store.set_enabled(False)
                self.send_json({'archived': True})
            else:
                self.send_error(404)
        except (ValueError, KeyError, TypeError, UnicodeError) as error:
            self.send_json({'error': str(error) or 'Could not save this change.'}, 422)
        except OSError:
            self.send_json({'error': 'Could not write the photograph. Your changes have not been saved.'}, 500)

    def translate_path(self, path):
        if urlsplit(path).path == '/website-text.md':
            return str(self.server.photo_store.root / 'website-text.md')
        return super().translate_path(path)

    def send_media_head(self):
        path = Path(self.translate_path(self.path))
        if not path.is_file() or not self.headers.get('Range'):
            return super().send_head()
        size = path.stat().st_size
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers['Range'])
        if not match or not any(match.groups()):
            self.send_error(416)
            return None
        start, end = match.groups()
        if start:
            start, end = int(start), min(int(end) if end else size-1, size-1)
        else:
            start, end = max(0, size-int(end)), size-1
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end-start+1))
        self.end_headers()
        import io
        with path.open('rb') as source:
            source.seek(start)
            return io.BytesIO(source.read(end-start+1))

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    import functools
    handler = functools.partial(MediaHandler, directory=str(ROOT/'dist'))
    print('Local preview: http://127.0.0.1:4173', flush=True)
    server = ThreadingHTTPServer(('127.0.0.1',4173), handler)
    server.photo_store = PHOTO_STORE
    server.album_store = ALBUM_STORE
    server.editor_token = EDITOR_TOKEN
    server.serve_forever()
