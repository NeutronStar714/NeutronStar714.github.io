# Photography albums

The public photography page now uses six albums. The map editor and its data have
been archived under `tools/archive/photography-map/`. The original map data is also
retained as `dist/photography.json`. Neither is loaded by the album page.

## Private editor

Start the preview with `python preview-server.py`, then run:

```
python photography-tool.py enable
```

Open http://127.0.0.1:4173/__album-editor. The earlier `/__photo-editor` bookmark
redirects to the new editor while it is enabled. It is served only by the local
preview, never included in `dist/`, and requires loopback access and a session
token for changes. It is not a hosted administration system.

To hide it: `python photography-tool.py archive`. The editor also has an Archive
editor action under Editor options. The same enable command brings it back.

## Organizing

- Upload one or several photographs to the pool. Captions are optional.
- Drag a pool photograph onto an album name or into the current album.
- A photograph can appear in several albums. The pool always keeps its copy.
- Drag inside an album to order it, or use Move earlier / Move later.
- Drag a member back into the pool, or choose Remove from album, to remove only
  that album membership.
- Check pool photographs and choose Add selected to album as a keyboard/touch
  alternative to dragging.
- To delete pool photographs, check them and choose Delete photographs. After
  confirmation they are removed from every album, and affected album covers are
  replaced. Their website image copies and a recovery record are archived under
  `.local/photo-pool-trash/`; external originals and all Markdown text are kept.
- Drag an album by its grip to set the album order on the public page. Drop it
  above or below another album, or use its up/down buttons. This order is saved
  immediately and persists after reloading the editor.
- Set as cover changes the album's cover; the album keeps its own photo order.
  The public cover opens that selected cover photo. Editor saves notify other
  local gallery tabs immediately; returning to a visible tab also refreshes its
  album data. The live GitHub site updates after the usual commit and pushes.
- Create, rename or delete albums. Deleting an album leaves its photos in the pool.
- Edit an optional caption under each pool photograph and choose Save caption.

`dist/photo-albums.json` stores the pool and ordered album memberships. New photos
get an efficient thumbnail, a screen-size WebP and a full-resolution WebP in
`dist/assets/photo-albums/`. Only adjacent screen-size slides preload; full-resolution
images load when zooming. Source files in `D:\Stuffs` were read only, with SHA-256
hashes checked before and after import. The import receipt is in
`.local/photo-source-hashes.json`.

Every album title and nonempty caption is appended to `website-text.md`. Manual
edits there appear on reload or tab focus. Changing a title/caption in the editor
adds a new entry and preserves every old Markdown entry. Blank captions simply
hide their display; they never delete earlier writing from the Markdown file.

Photo 15 belongs to both The blue hour and Hiking, on the way. Its viewer offers
See also links in both directions, opening that same photograph in the other album.

The viewer divides its space 2:1 between the selected photograph and a vertical
carousel of every photograph in that album. The selected card stays at the vertical
center at full size. Up to three neighbors in each direction shrink progressively
and overlap behind it, with animated expansion/contraction as selection changes.
One wheel gesture advances one photograph; trackpad momentum is grouped until
there has been a 180 ms input gap. Click an exposed card, swipe the carousel,
use its up/down buttons, or navigate with arrow keys and Home/End.
It has no slideshow playback or arrow/zoom buttons over the main photo. Left/right
arrow keys and swipe navigate; wheel/pinch zoom and drag to pan remain supported.
Double-click the photo to magnify it or return it to its fitted size.
Escape closes the viewer and returns focus.
The global music player survives page changes and continues while viewing albums.

The public page also has two continuous rows of photograph previews above the
album covers, taking roughly half the viewport height. They move in opposite
directions, with no gaps, frames, or background boxes around individual images.
The selection is split into disjoint rows, with one extra photo in the first row
when the total is odd. Neither row is padded with photos from the other row;
each row repeats only its own sequence for the continuous animation.
Photographs retain their own aspect ratios. The strip has no pause controls or
hover/focus/viewer/offscreen pause behavior.

The pinned **Main page strip** album at the top of the private editor chooses
exactly which photographs appear in the strip, and in what order. It starts with
the previous strip selection. Drag from the pool to add photographs, reorder them
within the pinned album, and remove them without affecting other albums. Leaving
it empty hides the strip. It stays pinned above ordinary albums, has no cover,
and is not listed among the public album covers. New uploads and changes to
ordinary albums do not automatically change this selection.

Click a preview to open that photograph in an ordinary album when possible;
photos curated only for the strip open in the strip selection instead.
Hovering or focusing a
preview updates the info box between the heading and introduction: From '[album]',
followed by its optional caption on up to two lines. The last preview's information
stays visible so it can be read while the photos continue moving. The strip uses
thumbnails and never preloads full-resolution images.
Hover tracking also checks the photo passing beneath a stationary pointer, with
a light cyan outline on the current photo. The pointer check runs only while the
cursor is over the strip. The heading row's top padding has been reduced by 80%.
