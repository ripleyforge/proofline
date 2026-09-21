#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
uv run --project backend ruff check backend
uv run --project backend pytest backend/tests -q
npm --prefix frontend run typecheck
npm --prefix frontend run build
python3 scripts/scan_secrets.py
npm run test:browser
