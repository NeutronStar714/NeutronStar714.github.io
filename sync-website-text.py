"""Append new site copy to website-text.md without changing existing entries."""

from __future__ import annotations

from collections import OrderedDict
from hashlib import sha1
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
MARKDOWN = ROOT / "website-text.md"
MANIFEST = DIST / "website-text-map.json"
PAGES = OrderedDict([
    ("home", "index.html"),
    ("discography", "discography.html"),
    ("rock", "rock-band.html"),
    ("products", "products.html"),
    ("about", "../tools/archive/about/about.html"),
    ("photography", "photography.html"),
    ("editor", "../tools/photo-album-editor.html"),
])
entries: OrderedDict[str, dict[str, str]] = OrderedDict()


def normalize(value: str) -> str:
    return " ".join(str(value).split())


def add(page: str, value: str) -> None:
    source = normalize(value)
    if not source:
        return
    slug = re.sub(r"[^a-z0-9]+", "-", source.lower()).strip("-")[:38].strip("-") or "text"
    digest = sha1(source.encode("utf-8")).hexdigest()[:8]
    key = f"{page}.{slug}-{digest}"
    entries[key] = {"key": key, "page": page, "source": source}


class TextInventory(HTMLParser):
    def __init__(self, page: str):
        super().__init__(convert_charrefs=True)
        self.page = page
        self.skipped = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.skipped += 1
            return
        attributes = dict(attrs)
        for name in ("alt", "aria-label", "aria-valuetext", "title", "placeholder"):
            if attributes.get(name):
                add(self.page, attributes[name])
        if tag == "meta" and attributes.get("name") == "description":
            add(self.page, attributes.get("content", ""))

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self.skipped = max(0, self.skipped - 1)

    def handle_data(self, data: str) -> None:
        if not self.skipped:
            add(self.page, data)


for page, filename in PAGES.items():
    TextInventory(page).feed((DIST / filename).read_text(encoding="utf-8"))

node_program = r"""
const fs = require('fs');
const vm = require('vm');
const context = {window: {}};
for (const file of ['releases.js', 'release-notes.js']) {
  vm.runInNewContext(fs.readFileSync('dist/' + file, 'utf8'), context);
}
process.stdout.write(JSON.stringify({releases: context.window.releases, notes: context.window.releaseNotes}));
"""
music = json.loads(subprocess.check_output(["node", "-e", node_program], cwd=ROOT, text=True, encoding="utf-8"))

for index, release in enumerate(music["releases"], 1):
    add("discography", release["title"])
    year, month, day = release['date'].split('-')
    form = 'EP' if release['type'] == 'EP' else release['type'].lower()
    article = 'An' if form in ('album', 'EP') else 'A'
    add('discography', f'{article} {form} released on {month}/{day}/{year}.')
    for link in release.get('links', []):
        add('discography', link['label'])
    add("discography", release["type"].upper())
    add("discography", release["date"].replace("-", "."))
    add("discography", release["date"][:4])
    add("discography", f"{release['date'][:4]} / {release['type'].upper()}")
    add("discography", f"{index:02d}")
    add("discography", f"{release['title']} cover artwork")
    add("discography", f"{release['title']} description and tracklist")
    for clip in release["clips"]:
        title = re.sub(r"^exc\d+_", "", clip).removesuffix(".mp3").replace("_", " ")
        for value in (title, f"Play {title}", f"Pause {title}", f"Seek {title}"):
            add("discography", value)
        add("shared", f"Now playing: {title} (excerpt)")

for note in music["notes"]:
    add("discography", note["title"])
    add("discography", note.get("description", ""))
    for disc in note.get("tracklist", []):
        add("discography", disc.get("label", ""))
        for track in disc["tracks"]:
            add("discography", track["title"])
    count = sum(len(disc["tracks"]) for disc in note.get("tracklist", []))
    if count:
        add("discography", f"{count} {'track' if count == 1 else 'tracks'}")

for value in (
    "Listen to selected excerpts", "About this release", "Tracklist", "track", "tracks", "Next release",
    "Excerpt", "Could not load this excerpt. Please try again.",
    "Electronic music from 2020 to 2025", "2025 – 2020",
):
    add("discography", value)

for value in (
    "Ready to play", "Playing", "Paused", "Pause recording",
    "Could not load recording",
):
    add("products", value)

for title in ("Dynamic Resonator", "Extreme Shifter", "Snow", "Super Vibrato"):
    guitar = f"{title} guitar"
    for value in (
        guitar, f"Now playing: {guitar} (excerpt)",
        f"Play {guitar}", f"Pause {guitar}",
    ):
        add("shared", value)
    add("products", f"Pause {title} recording")

song = "Neutronstar714 - Impromptu in C, 2019-No.2"
for value in (
    song, f"Now playing: {song}", f"Play {song}", f"Pause {song}",
    "Music player", "Playback position", "Paused", "On repeat", "Excerpt",
):
    add("shared", value)

for value in (
    "G10 - Anyone", "Now playing: G10 - Anyone",
    "Play G10 - Anyone", "Pause G10 - Anyone",
    "Play Anyone", "Pause Anyone", "Could not load Anyone",
):
    add("shared", value)

photography = json.loads((DIST / "photography.json").read_text(encoding="utf-8"))
for place in photography["places"]:
    add("photography", place["name"])
for photo in photography["photos"]:
    add("photography", photo["caption"])
    for field in ("title", "quote", "quoteCredit", "context", "extract", "extractCredit", "credit"):
        add("photography", photo.get(field, ""))
    for source in photo.get("sources", []):
        add("photography", source["title"])
    for field in ("title", "caption"):
        add("photography", photo.get("documentary", {}).get(field, ""))

album_path = DIST / 'photo-albums.json'
if album_path.exists():
    albums = json.loads(album_path.read_text(encoding='utf-8'))
    for album in albums['albums']:
        add('photography', album['title'])
    if albums.get('stripAlbum'):
        add('photography', albums['stripAlbum']['title'])
    for photo in albums['photos']:
        add('photography', photo.get('caption', ''))
    for message in ('Unknown album', 'Unknown photograph', 'Invalid text', 'Photo exceeds 30 MB',
                    'Photo exceeds 60 megapixels', 'Unsupported image', 'Invalid image',
                    'Could not write the photograph. Your changes have not been saved.',
                    'Invalid album order', 'Invalid photograph path'):
        add('editor', message)

previous_manifest = []
if MANIFEST.exists():
    previous_manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
known_manifest = {item["key"] for item in previous_manifest}
previous_manifest.extend(item for key, item in entries.items() if key not in known_manifest)
MANIFEST.write_text(json.dumps(previous_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

heading = re.compile(r"^### `([^`]+)`$", re.MULTILINE)
existing = MARKDOWN.read_text(encoding="utf-8") if MARKDOWN.exists() else ""
known_markdown = set(heading.findall(existing))
new_entries = [item for key, item in entries.items() if key not in known_markdown]

if not MARKDOWN.exists():
    MARKDOWN.write_text(
        "# Website text\n\n"
        "Edit the words between the `text` fences. Each heading is a stable key used by the site.\n"
        "The preview reads this file on page load and when its tab regains focus.\n"
        "Do not remove entries; new site text is appended by `python sync-website-text.py`.\n\n",
        encoding="utf-8",
    )

if new_entries:
    with MARKDOWN.open("a", encoding="utf-8", newline="\n") as output:
        current_page = None
        for item in new_entries:
            if item["page"] != current_page:
                current_page = item["page"]
                output.write(f"\n## {current_page.title()}\n\n")
            output.write(f"### `{item['key']}`\n\n```text\n{item['source']}\n```\n\n")

# Deployment uses this mirror. The preview server serves the working-directory original.
shutil.copyfile(MARKDOWN, DIST / MARKDOWN.name)
print(f"{len(entries)} current strings; appended {len(new_entries)} entries to {MARKDOWN.name}")
