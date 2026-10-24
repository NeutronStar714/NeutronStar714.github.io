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
- Set as cover changes the album's cover; the slideshow keeps its own order.
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

The viewer supports previous/next, arrow keys, swipe, optional slideshow playback,
wheel/pinch zoom, drag to pan and Fit. Escape closes the viewer and returns focus.
The global music player survives page changes and continues while viewing albums.
