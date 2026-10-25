# Archived About page

The About me section was archived at the owner's request on 2026-10-25.
The original `about.html` and its dedicated `home.css` are kept here outside
the published `dist/` directory. All authored text remains in `website-text.md`;
the sync script continues to inventory this archived page without pruning text.

The five active pages no longer link to About, and the home star is decorative.
`dist/about.html` only redirects old bookmarks to Home.

To restore the section:

1. Copy `about.html` and `home.css` back into `dist/`.
2. Add the About navigation link to every public page and the About route to
   `dist/site-nav.js`. Restore the home star's link if desired.
3. Point the About entry in `sync-website-text.py` back to `about.html`.
4. Refresh script/style version suffixes, run `python sync-website-text.py`,
   and check navigation and the page in the local preview.

The HTML is an exact snapshot from before archiving. When restoring it, align
its navigation with the current site and retain `dist/site-copy.js` so manual
Markdown wording continues to apply.
