# Photography archive

## First implementation

The public page starts with a China-focused, 4:3 map. Its height remains no more
than half the viewport. It uses locally bundled MapLibre GL JS 5.6.2 and a locally
hosted, modified VersaTiles style with OpenStreetMap vector tiles from its public
service. The public service needs no account or API key.

Country and continent labels are omitted. Local place and road names appear on
closer views, without uppercase text transforms. Roads, paths, waterways,
buildings, and province boundaries load as needed. The vector source has native
zoom levels through 14; the map supports overzoom to 19. This retains the source's
geometry and does not manufacture additional detail. Rural-road coverage depends
on the source data: it cannot guarantee that every road has been surveyed.

Map tiles and glyphs require a network connection. Tile failure produces a
visible status and accessible place buttons; photographs remain available.
There is no coarse road overlay presented as a substitute for street detail.

The hierarchy is region → named location → anonymous photograph coordinates.
The overview shows regions. A region expands into its locations and directly
assigned photographs; a location expands into exact photo pins. Expansion zoom
depends on the group's geographic footprint and the map's shorter dimension
(45% occupancy), bounded to zoom 6.5–10 for regions and 10–14 for locations.
Nearby named nodes combine within 64 screen pixels; photo pins combine within
56 pixels and split with zoom. Clicking a coincident-photo cluster opens its
photographs rather than zooming endlessly.

The two selectors below the introduction navigate regions and their locations.
At photographic detail, visible photographs spread around the 4:3 map: beside
it on wide screens and above/below it in horizontally scrollable strips on
narrow or portrait screens. Up to 12 nearby previews surround the map; all
located photo pins remain on the map and the gallery includes the full selected
collection. Missing coordinates never inherit a region or location anchor.

The viewer reveals only the sections supplied for a photograph:

1. A full photograph, caption, optional quotation and attribution.
2. A personal account, ordinarily around 100–200 words.
3. Original notes or documentary audio/video, followed by source links.

The photograph opens in an image-only, full-window view. The caption floats on
the image with a light text shadow; the site navigation and music dock are hidden
until it closes. Wheel or pinch zoom, zoom buttons, double-click zoom, and dragging
work within the image. Fit (or the 0 key) restores the whole composition. A
full-resolution image loads on demand when zooming past the fitted preview.

An optional story button opens the writing. Next/back buttons, section buttons,
left/right keys, and horizontal swipes navigate the reading sections. In image
view, arrow keys pan a zoomed photograph or select the adjacent photograph when
fitted. Escape or the close button returns to the map. Photographs from the same
place also have previous/next image controls.
Architecture, infrastructure, and other artistic photographs can stand alone.
They do not display empty story or source sections.

No sample photographs, invented quotations, encounter narratives, or sources have
been published as the photographer's work. Actual material belongs in the next
content pass.

## Authoring

Enable the existing local editor with `python photography-tool.py enable`, then
open http://127.0.0.1:4173/__photo-editor. Create or edit regions and locations in
the named-place form. A location must belong to a region. Each upload has an optional **Story and sources** section.
Saved photographs also have these fields, so writing can be added later without
uploading another copy of the image.

The editor has no link in the public navigation. It is served only by the local
preview server to loopback clients, with same-origin, session-token write checks.
Its files and endpoints are not included when publishing `dist/`. Use the
**Archive editor** button or `python photography-tool.py archive` to disable it;
`python photography-tool.py enable` reactivates it without losing content.

Select photographs first to inspect their embedded EXIF GPS. This inspection is
local and does not save or publish the file. Each photograph has its own location
controls: choose a region, optionally a named location, and its anonymous
coordinates. Uploading never creates named places. When
GPS is found, coordinates are filled in for review; missing or invalid GPS is
never inferred from the scene. **Use embedded GPS** restores the camera location.
The initial Lijiang photograph had no embedded GPS. Its region anchor remains
approximate, and its photograph-specific coordinates are unset. It appears in
the gallery and the editor shows **No location data** until manually placed.

Use **Locate on map** on a queued photograph, then click the map to place its
highlighted draft pin. Click again to adjust. Selecting a named marker assigns
the photograph to that group without copying the marker's coordinates.
**Use map center** is an alternative to pointing. **Return to details** brings
you back to its caption and location fields. A manually placed new pin does not
move an existing saved place. Nothing is published until **Save photographs**.
For batches, review the caption and location of each photograph before saving.
Original EXIF metadata is stripped from the published JPEG; the photograph's
selected coordinates supply its public map position. It can be saved without
coordinates and placed later. Saved photographs expose editable captions,
group membership, and coordinates without uploading a second copy.

Camera JPEGs detected as MPO are accepted. Only the primary photograph is
published, with its full pixel dimensions; companion frames are not added as
separate photographs. JPEG, PNG, WebP, TIFF, AVIF, BMP, and JPEG 2000 are accepted
by the installed Pillow decoders. Original files are read only. The 30 MB and
60-megapixel input limits remain in place.

Upload progress, validation and server errors appear directly beside Save.
An unsupported decoded format is named in the error. Files and captions stay
selected after failure. A successful save is confirmed against the refreshed
archive, and the saved-photo filter resets to show all newly saved photographs.
The archive button is inside **Editor options** to prevent a single stray click
from disabling the editor.

Named groups support add, rename, moving their anchor, and deletion. Locations
can also move to a different parent region. Deleting a location returns its
photographs to the parent region. Deleting a region with content requires a
destination region for its locations and photographs. All photographs and exact
coordinates are retained. Deletion and renaming never remove Markdown entries.

Version 2 of `photography.json` retains `places`: each named node has
`level: "region"` or `level: "location"` with a `parentId`. A photo's `placeId`
references either named level. Its `coordinates` is null or
`{"lat":32.0,"lng":118.0,"source":"gps"}` (or `"manual"`). These coordinates have
no name or label and are independent of the named node's anchor.

For source links, enter one `title | https://address` per line. Documentary media
should be a direct video/audio URL or a local path under `assets/` or
`musicsources/`. Documentary playback uses the shared site audio coordinator.

All authored writing is appended to `website-text.md`, including quotations,
attributions, context, source titles, and media captions. Manual Markdown edits
continue to refresh on page load and tab focus. Story updates append new entries;
old Markdown text is retained. The editor and write endpoints can still be
archived and remain outside `dist/`.

`dist/photography.json` keeps places and photo records. Optional photo fields:

```json
{
  "title": "",
  "credit": "",
  "quote": "",
  "quoteCredit": "",
  "context": "",
  "extract": "",
  "extractCredit": "",
  "documentary": {"src": "musicsources/extract.mp4", "kind": "video", "title": ""},
  "sources": [{"title": "", "url": "https://example.org/"}]
}
```

This is a schema illustration, not public archive content. Do not add empty
documentary or source objects to actual records.

## Next steps

1. Curate one real photograph and encounter end to end, including exact location,
   quotation attribution, personal account, and any original extract or sources.
2. Add an urban or architectural photograph to check that the experience gives
   artistic work equal room without forcing a research narrative.
3. Tune the image sequencing and map locations against the growing collection.
4. Design contributor submission, credit, review, and publication only after the
   visitor experience has been tested with actual material.

## Checks

`node tests/photography-archive.test.mjs` checks the progressive sections, source
links, place selection, and label-free street-detail style.
`python -m unittest discover -s tests -p test_photography.py` checks isolated
uploads, story saving, append-only Markdown, and editor archive/reactivation.

`tools/check-map-tile.py` can inspect a downloaded MVT for transportation classes.
Wuyuan tiles at native zoom 14 were inspected for street and path geometry.

Map sources and library licensing are recorded in `dist/vendor/maplibre/`.
