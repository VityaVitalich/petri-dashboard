# Petri dashboard — notes for Claude

Static site (index.html + app.js + style.css, no build step) that shows the Petri audits
made with the MR-Eval `petri` skill. `build_data.py` turns `~/MR-Eval/outputs/petri` into
`data/`; GitHub Pages serves `/` of `main` at https://vityavitalich.github.io/petri-dashboard/.

Two people publish here: Viktor (owner, works in this repo directly) and collaborators who
work in a **fork** (origin = their fork, `upstream` = VityaVitalich/petri-dashboard).
Check which you are with `git remote -v` before doing anything that pushes.

## Publishing new runs
`./deploy.sh`, and nothing else. It picks the mode from the remotes:
- owner: commits on `main` and pushes.
- fork: rebuilds on top of `upstream/main` on branch `data-refresh`, force-pushes it to
  the fork and opens or updates one pull request. Tell the user the PR link and that the
  site changes once Viktor merges it.

The build **merges**: runs on this machine replace their published copies, and every
other published run is kept. Never pass `--prune` (it publishes only local runs, which
deletes everyone else's transcripts from the site) unless Viktor asks for it by name.
Never hand-edit or delete files in `data/`.

## Changing the dashboard itself (layout, views, charts, fixes)
1. Start from the live code: `git fetch upstream && git switch -c <short-topic> upstream/main`
   (owner: branch from `origin/main`).
2. Edit `app.js` / `style.css` / `index.html` (and `build_data.py` if the change needs new
   data). Keep the existing style: plain JS, no frameworks, no new dependencies, no CDN
   scripts.
3. Preview: `./serve.sh` → http://localhost:8765. Check the Overview, a Transcript, Compare
   and Seeds views, in light and dark (`?theme=dark`). Describe what changed to the user in
   plain words, with a screenshot if you can take one.
4. Commit only the files you changed (explicit paths, never `git add -A`), push the branch
   to `origin`, then `gh pr create --repo VityaVitalich/petri-dashboard --base main`.
   One topic per PR. Data refreshes go through `deploy.sh`, not into a code PR.
5. Return to `main` afterwards (`git switch main`); `deploy.sh` leaves you on `data-refresh`.

The README's table describes every view; update it when a view changes.
