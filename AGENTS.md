# Project instructions

`website-text.md` in this directory is the editable source for the website's authored text.

- Never remove an entry or any text that the user or an agent added to `website-text.md` without asking the user first. Editing an existing entry also requires following the user's current instruction; preserve their manual wording.
- When adding website text, append a new entry to `website-text.md`. Run `python sync-website-text.py` to discover and append new strings. The script must never rewrite or prune existing Markdown entries.
- Keep `dist/site-copy.js` connected on every page. `preview-server.py` serves the working-directory Markdown file live; `dist/website-text.md` is the deployment mirror refreshed by the sync script.
- Generated counters, time displays, frequencies, and playback positions are runtime data. Their authored labels belong in the Markdown file.
