"""Current Markdown copy must be readable before any browser-side fetch."""
import functools
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import unittest
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from website_copy import read_markdown, render_html

spec = importlib.util.spec_from_file_location('copy_preview', ROOT / 'preview-server.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class WebsiteCopyTests(unittest.TestCase):
    manifest = [
        {'page': 'home', 'key': 'home.title', 'source': 'Old heading'},
        {'page': 'home', 'key': 'home.intro', 'source': 'Old introduction'},
        {'page': 'home', 'key': 'home.label', 'source': 'Old description'},
        {'page': 'home', 'key': 'home.optional', 'source': 'Optional text'},
    ]
    html = ('<!doctype html><title>Old heading</title>'
            '<meta name="description" content="Old description">'
            '<h1>Old heading</h1><p>Old introduction</p><aside>Optional text</aside>'
            '<script>const untouched = "Old introduction";</script>')

    def test_rendered_page_has_current_copy_and_safe_title_without_javascript(self):
        values = {'home.title': 'A <new> heading', 'home.intro': 'My current introduction',
                  'home.label': 'A "description" & more', 'home.optional': ''}
        rendered = render_html(self.html, 'home', self.manifest, values)
        self.assertIn('A &lt;new&gt; heading</title>', rendered)
        self.assertNotIn('<title><!--', rendered)
        self.assertIn('My current introduction</p>', rendered)
        self.assertIn('content="A &quot;description&quot; &amp; more"', rendered)
        self.assertIn('const untouched = "Old introduction";', rendered)
        self.assertEqual(rendered, render_html(rendered, 'home', self.manifest, values))
        values['home.title'] = 'A later edit'
        values['home.optional'] = 'Filled in later'
        updated = render_html(rendered, 'home', self.manifest, values)
        self.assertIn('A later edit</h1>', updated)
        self.assertIn('Filled in later</aside>', updated)
        self.assertNotIn('A &lt;new&gt;', updated)

    def test_preview_uses_latest_root_markdown_on_first_response_without_sync(self):
        directory = ROOT / '.local/copy-tests'
        directory.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=directory) as name:
            root = Path(name)
            (root / 'dist').mkdir()
            html_path = root / 'dist/index.html'
            html_path.write_text(self.html, encoding='utf-8')
            (root / 'dist/website-text-map.json').write_text(json.dumps(self.manifest), encoding='utf-8')
            md = root / 'website-text.md'
            md.write_text('### `home.title`\n\n```text\nFresh preview\n```\n', encoding='utf-8')
            server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(
                preview.MediaHandler, directory=str(root / 'dist')))
            server.photo_store = SimpleNamespace(root=root)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for title in ('Fresh preview', 'Manually edited again'):
                    md.write_text(f'### `home.title`\n\n```text\n{title}\n```\n', encoding='utf-8')
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                    connection.request('GET', '/')
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertIn(title + '</h1>', response.read().decode('utf-8'))
                    connection.close()
                self.assertEqual(html_path.read_text(encoding='utf-8'), self.html)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_current_homepage_is_already_current_and_markdown_is_complete(self):
        markdown = (ROOT / 'website-text.md').read_text(encoding='utf-8')
        values = read_markdown(markdown)
        self.assertEqual(len(values), markdown.count('```text'))
        html = (ROOT / 'dist/index.html').read_text(encoding='utf-8')
        self.assertIn('Four ways of<br>', html)
        self.assertIn('artistic expression.</h1>', html)
        self.assertIn(values['home.i-m-neutronstar714-i-make-electronic-m-f17f7e09'], html)
        self.assertNotIn('and the way I see.', html)
        self.assertEqual(markdown, (ROOT / 'dist/website-text.md').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
