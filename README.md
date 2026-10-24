# NeutronStar714 — Discography

A static HTML, CSS and JavaScript website. Authored public files are in dist/.

Preview from this directory:

    python preview-server.py

Open http://127.0.0.1:4173.

## Navigation and continuous playback

The home page is a single-viewport orbital hub. Four ordinary links with actual
work previews orbit the hand-drawn neutron star. CSS transforms move the links
and counter-rotate their contents so labels stay upright. The orbit continues
during hover and keyboard focus; the pause control and reduced-motion setting
stop it. ResizeObserver fits the orbit to the remaining viewport below the shared
header, reserving space for the music dock. The light-bending canvas remains
static and redraws only for layout, image loading, or page activation.

`dist/site-nav.js` keeps the header and shared player in one document and switches
between the existing HTML pages with the History API. Each visited section is
mounted once and kept connected while hidden, so its audio element and playback
position survive navigation. Direct page URLs, section anchors, modified clicks,
and browser Back/Forward remain available.

Page modules export `mount(root)` and query inside their own section. Optional
`activate` and `deactivate` callbacks suspend visuals while a section is hidden;
they do not stop its audio. The router enables only the current page's styles,
and `site-copy.js` refreshes that page from `website-text.md` after navigation.
Session storage restores the ambient track only after a real reload, rather
than recreating the player on every section change.

## Edit website text

Edit the fenced text under the matching heading in `website-text.md`. Reload the preview, or return to its tab, to see the new wording. The preview reads that file in this directory. Run `python sync-website-text.py` after adding new text to the site and before publishing to append new entries and refresh the copy in `dist/`. The sync script preserves existing Markdown entries and your edits.

## Product recordings

The four `pr-vid-*.mp4` files in `dist/musicsources/` include the guitar audio.
Each plugin's `<video>` element is the sole media source for its local controls
and the global player. There is no separate audio file or synchronization loop.
Videos have no native controls, accept no pointer input, and continue playing
when another section is opened.

The posters in `dist/assets/products/*-first-frame.webp` come from frame zero of
each recording. The `aspect-ratio` on each `.plugin-screen` hides only the black
side margins of the supplied recording. The MP4 streams are copied without
re-encoding and have their metadata at the front for progressive playback.

Each `.plugin-section` sets its own `--plugin-width` and `--plugin-ratio`.
The display can shrink to fit the viewport height, and `video-left` alternates
the desktop arrangement for Extreme Shifter and Super Vibrato. Mobile stacks
the text and controls above each video.

## Release data

Edit dist/releases.js to change release data. Add a description field to replace lorem ipsum. Add verified external URLs to each release's links array, for example:

    links: [{ label: "Bandcamp", url: "https://YOUR-VERIFIED-RELEASE-URL" }]

Empty link arrays show no dead or invented links. Covers and excerpts were copied unchanged from musicsources/ into dist/musicsources/. If you replace original media, also update the copy in dist/musicsources/.

Playback uses the full duration of each supplied excerpt, without an artificial time limit. Only one excerpt plays at a time. Audio is loaded on demand. Desktop alternates titles and introductions around the covers; smaller screens rearrange content for readability.

No analytics or external interface fonts. The photography albums load local image derivatives on demand. The text sync script uses Python and Node before publishing. The local photography editor uses Pillow for image validation and publishing.

## Photography albums and the local editor

The public photography page is now an album gallery, with full-screen slideshows,
optional captions, zoom and links to other albums containing the same photograph.
The six initial albums use the numbered candidate photographs; photo 15 belongs to
both The blue hour and Hiking, on the way. No map or external tile service is loaded.

Enable the private pool editor with `python photography-tool.py enable`, then open
`http://127.0.0.1:4173/__album-editor`. The old editor bookmark redirects there.
Captions are optional. Drag or select photos to add them to albums, reorder them,
remove memberships, and set covers. A photo can belong to several albums and always
remains in the pool. Archive/reactivate with `python photography-tool.py archive`
and `python photography-tool.py enable`.

Full documentation: [docs/photography-albums.md](docs/photography-albums.md).
The former map editor and its data are retained in `tools/archive/photography-map/`.
Its original design notes remain in `docs/photography-archive.md`.

Publish only `dist/`. The private editor, backend and local state stay outside it.
The editor's write API requires a loopback request and a same-origin session token.
Website text is still maintained in `website-text.md`, append-only, with a deployment
mirror in `dist/website-text.md`.

Run the isolated album persistence and API checks:

    python -m unittest discover -s tests -p test_photo_albums.py
