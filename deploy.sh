#!/usr/bin/env bash
# Rebuild data/ from the MR-Eval petri outputs and publish to GitHub Pages.
#
#   ./deploy.sh                 # rebuild + commit + push (main branch, Pages serves / of main)
#   ./deploy.sh --skip-build    # publish already-built data/
#   ./deploy.sh --mreval PATH   # non-default MR-Eval checkout (forwarded to build_data.py)
#
# Pages URL: https://vityavitalich.github.io/petri-dashboard/
# Stages explicit paths only (never `git add -A`), refuses to push from a
# branch other than main.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SKIP_BUILD=0
BUILD_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    *) BUILD_ARGS+=("$1"); shift ;;
  esac
done

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

BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "✗ on branch '$BRANCH', not main — refusing to publish" >&2
  exit 1
fi

git add data index.html app.js style.css build_data.py deploy.sh serve.sh README.md .gitignore .nojekyll
if git diff --cached --quiet; then
  echo "▸ nothing to publish (no changes)"
  exit 0
fi
git commit -q -m "refresh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main
echo "▸ pushed — Pages rebuilds in ~1 min: https://vityavitalich.github.io/petri-dashboard/"
