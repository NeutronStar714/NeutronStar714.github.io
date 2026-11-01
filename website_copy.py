"""Render editable copy before HTML reaches the browser, retaining stable bindings."""
from html import escape
from html.parser import HTMLParser
import json
import re


MARKER = 'site-copy:'
ATTR_KEYS = 'data-site-copy-keys'
TEXT_KEY = 'data-site-copy-text'
ATTRIBUTES = ('alt', 'aria-label', 'aria-valuetext', 'title', 'placeholder', 'content')


def normalize(value):
    return ' '.join(str(value).split())


def read_markdown(markdown):
    values, lines, key, inside = {}, [], None, False
    for line in markdown.splitlines():
        if inside:
            if line == '```':
                values[key] = '\n'.join(lines).strip()
                inside = False
            else:
                lines.append(line)
        elif line.startswith('### `') and line.endswith('`'):
            key = line[5:-1]
        elif line == '```text' and key:
            inside, lines = True, []
    return values


def render_html(html, page, manifest, values):
    active = [item for item in manifest if item['page'] == page]
    active += [item for item in manifest if item['page'] == 'shared']
    sources = {}
    for item in active:
        sources.setdefault(normalize(item['source']), item['key'])

    class Renderer(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.lines = [0]
            self.lines.extend(match.end() for match in re.finditer('\n', html))
            self.patches = []
            self.skip = None
            self.ignored = []
            self.title_key = None
            self.bound_text_end = -1

        def position(self):
            line, column = self.getpos()
            return self.lines[line - 1] + column

        def handle_comment(self, data):
            if self.skip or self.ignored or not data.startswith(MARKER):
                return
            key = data[len(MARKER):]
            if key not in values:
                return
            start = html.index('-->', self.position()) + 3
            end = html.find('<', start)
            if end == -1:
                end = len(html)
            whitespace = re.fullmatch(r'(\s*)(.*?)(\s*)', html[start:end], re.DOTALL)
            self.patches.append((start, end, whitespace[1] + escape(values[key], quote=False) + whitespace[3]))
            self.bound_text_end = end

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            void = tag in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
            if self.ignored or 'data-site-copy-ignore' in attributes:
                if not void:
                    self.ignored.append(tag)
                return
            if tag in {'script', 'style', 'textarea', 'noscript'}:
                self.skip = tag
                return
            if self.skip:
                return
            raw = self.get_starttag_text()
            if tag == 'title':
                start = self.position() + len(raw)
                end = html.find('</title', start)
                self.title_key = attributes.get(TEXT_KEY) or sources.get(normalize(html[start:end]))
                if self.title_key in values:
                    if TEXT_KEY not in attributes:
                        raw = raw[:-1] + f' {TEXT_KEY}="{self.title_key}">'
                    self.patches.append((self.position(), start, raw))
            keys = json.loads(attributes.get(ATTR_KEYS, '{}'))
            for name in ATTRIBUTES:
                if name not in attributes or name == 'content' and not (
                        tag == 'meta' and attributes.get('name') == 'description'):
                    continue
                key = keys.get(name) or sources.get(normalize(attributes[name]))
                if key not in values:
                    continue
                keys[name] = key
                pattern = rf'(\s{re.escape(name)}\s*=\s*)(?:"[^"]*"|\x27[^\x27]*\x27|[^\s>]+)'
                raw = re.sub(pattern, lambda match: match[1] + '"' + escape(values[key], quote=True) + '"', raw, count=1, flags=re.I)
            if keys:
                raw = re.sub(rf'\s{ATTR_KEYS}\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27)', '', raw)
                end = len(raw) - (2 if raw.endswith('/>') else 1)
                raw = raw[:end] + f' {ATTR_KEYS}="{escape(json.dumps(keys), quote=True)}"' + raw[end:]
                self.patches.append((self.position(), self.position() + len(self.get_starttag_text()), raw))

        def handle_endtag(self, tag):
            if self.ignored and tag in self.ignored:
                while self.ignored.pop() != tag:
                    pass
            if tag == 'title':
                self.title_key = None
            if tag == self.skip:
                self.skip = None

        def handle_data(self, data):
            start = self.position()
            if self.skip or self.ignored or start < self.bound_text_end:
                return
            key = self.title_key or sources.get(normalize(data))
            if key not in values:
                return
            end = html.find('<', start)
            if end == -1:
                end = len(html)
            raw = html[start:end]
            whitespace = re.fullmatch(r'(\s*)(.*?)(\s*)', raw, re.DOTALL)
            marker = '' if self.title_key else f'<!--{MARKER}{key}-->'
            replacement = marker + whitespace[1] + escape(values[key], quote=False) + whitespace[3]
            self.patches.append((start, end, replacement))

    parser = Renderer()
    parser.feed(html)
    for start, end, replacement in sorted(parser.patches, reverse=True):
        html = html[:start] + replacement + html[end:]
    return html

