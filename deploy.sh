#!/usr/bin/env bash
# Rebuild data/ from the MR-Eval petri outputs and publish to GitHub Pages.
#
#   ./deploy.sh                 # rebuild + publish (see the two modes below)
#   ./deploy.sh --skip-build    # publish already-built data/
#   ./deploy.sh --mreval PATH   # non-default MR-Eval checkout (forwarded to build_data.py)
#   ./deploy.sh --prune         # forwarded: publish ONLY local runs (drops everyone else's)
#
# Pages URL: https://vityavitalich.github.io/petri-dashboard/
#
# Two modes, picked from the remotes:
#   owner        origin is VityaVitalich/petri-dashboard. Commits on main and pushes it.
#   contributor  a fork: origin is the fork, `upstream` is VityaVitalich/petri-dashboard.
#                Builds on top of upstream/main on the branch `data-refresh`, pushes it to
#                the fork and opens (or updates) a pull request. The site changes once
#                the owner merges it.
# The build merges with what is already published, so neither mode drops other
# people's runs. Stages explicit paths only (never `git add -A`).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

UPSTREAM_SLUG="VityaVitalich/petri-dashboard"
SKIP_BUILD=0
BUILD_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    *) BUILD_ARGS+=("$1"); shift ;;
  esac
done

if git remote get-url origin 2>/dev/null | grep -q "$UPSTREAM_SLUG"; then
  MODE=owner
elif git remote get-url upstream >/dev/null 2>&1; then
  MODE=contributor
else
  echo "✗ origin is not $UPSTREAM_SLUG and there is no 'upstream' remote." >&2
  echo "  In a fork run: git remote add upstream https://github.com/$UPSTREAM_SLUG.git" >&2
  exit 1
fi
echo "▸ mode: $MODE"

if [[ "$MODE" == contributor ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "✗ uncommitted changes — commit or stash them first (they belong in their own PR)" >&2
    exit 1
  fi
  git fetch -q upstream main
  # always start from what is live now, so the PR never conflicts with newer refreshes
  git switch -q -C data-refresh upstream/main
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "▸ building data/"
  python3 build_data.py ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}   # bash-3.2-safe empty array
fi

python3 - <<'PY'
import json, pathlib
idx = json.loads(pathlib.Path("data/index.json").read_text())
for r in idx["runs"]:
    assert pathlib.Path("data", r["file"]).is_file(), f"missing {r['file']}"
print(f"▸ validated: {len(idx['transcripts'])} transcripts in {len(idx['runs'])} runs")
PY

if [[ "$MODE" == owner ]]; then
  BRANCH=$(git branch --show-current)
  if [[ "$BRANCH" != "main" ]]; then
    echo "✗ on branch '$BRANCH', not main — refusing to publish" >&2
    exit 1
  fi
fi

git add data index.html app.js style.css build_data.py deploy.sh serve.sh README.md CLAUDE.md .gitignore .nojekyll
if git diff --cached --quiet; then
  echo "▸ nothing to publish (no changes)"
  exit 0
fi
git commit -q -m "refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ "$MODE" == owner ]]; then
  git push origin main
  echo "▸ pushed — Pages rebuilds in ~1 min: https://vityavitalich.github.io/petri-dashboard/"
else
  git push -q -f origin data-refresh
  PR_URL=$(gh pr list --repo "$UPSTREAM_SLUG" --head data-refresh --state open --json url -q '.[0].url')
  if [[ -n "$PR_URL" ]]; then
    echo "▸ updated the open pull request: $PR_URL"
  else
    FORK_OWNER=$(gh api user -q .login)
    gh pr create --repo "$UPSTREAM_SLUG" --base main --head "$FORK_OWNER:data-refresh" \
      --title "Petri data refresh from $FORK_OWNER" \
      --body "New Petri runs from $FORK_OWNER's machine. Built with the merging build_data.py, so every run already on the site is kept."
  fi
  echo "▸ the live site updates once the pull request is merged"
fi
