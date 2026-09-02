#!/usr/bin/env bash
# Local preview: rebuild data/ and serve the site at http://localhost:8765
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[[ "${1:-}" == "--skip-build" ]] || python3 build_data.py
PORT=${PORT:-8765}
echo "▸ http://localhost:$PORT  (ctrl-c to stop)"
python3 -m http.server "$PORT" --bind 127.0.0.1
