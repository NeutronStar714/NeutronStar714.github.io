# Publishing to GitHub Pages

Repository: https://github.com/NeutronStar714/NeutronStar714.github.io

Public website: https://neutronstar714.github.io/

Publishing uses GitHub's Deploy from a branch setting. GitHub's folder selector
offers only `/` and `/docs`, so `dist/` is published as the root of a dedicated
`gh-pages` branch using Git subtree. The main branch stores the complete project.
No custom Actions workflow is needed. `dist/.nojekyll` tells Pages to serve the
static files directly.

The private editor and its write API are not part of the published website.
Source code committed outside `dist/` is still visible in a public GitHub
repository. Local browser profiles, local editor state, and original media in the
root `musicsources/` folder are excluded from Git.

## First connection

As checked on 2026-10-24, the local branch was `master`, and `origin/main` contained
only the initial repository README. The histories were unrelated. After committing
the current website, rename the local branch to `main`, then merge the initial
GitHub history using the `ours` strategy. This preserves the current local website
tree and records both histories, allowing a normal push without force.

```
python sync-website-text.py
git add .
git commit -m "Prepare personal website for GitHub Pages"
git branch -m main
git merge -s ours --allow-unrelated-histories origin/main -m "Connect GitHub repository history"
git push -u origin main
git subtree push --prefix dist origin gh-pages
```

Those history-joining commands are for this first connection only.

After the pushes, open Settings > Pages and select Deploy from a branch,
then `gh-pages` and `/ (root)`, and Save.

## Later updates

```
python sync-website-text.py
git add .
git commit -m "Update website"
git push
git subtree push --prefix dist origin gh-pages
```

GitHub automatically publishes the selected branch after each subtree push.
Photographs added in the local editor are saved into `dist/` and included in the
next commit and push. Always run the text sync before committing: no custom
workflow refreshes the deployment mirror on the server.
