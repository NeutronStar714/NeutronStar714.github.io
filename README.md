# NeutronStar714 — Discography

A dependency-free HTML, CSS and JavaScript website. Authored files are in dist/.

Preview from this directory:

    python -m http.server 4173 --bind 127.0.0.1 --directory dist

Open http://127.0.0.1:4173.

## Edit content

Edit dist/releases.js to change release data. Add a description field to replace lorem ipsum. Add verified external URLs to each release's links array, for example:

    links: [{ label: "Bandcamp", url: "https://YOUR-VERIFIED-RELEASE-URL" }]

Empty link arrays show no dead or invented links. Covers and excerpts were copied unchanged from musicsources/ into dist/musicsources/. If you replace original media, also update the copy in dist/musicsources/.

Playback uses supplied excerpts and stops at 60 seconds (or the file's end when shorter). Only one excerpt plays at a time. Audio is loaded on demand. Desktop alternates titles and introductions around the covers; smaller screens rearrange content for readability.

No analytics, external fonts, build step, or runtime dependencies.
