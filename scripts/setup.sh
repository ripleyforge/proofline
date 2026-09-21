#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo 'Install uv from https://docs.astral.sh/uv/getting-started/installation/ first.'; exit 1; }
command -v npm >/dev/null || { echo 'Install Node.js 22 or newer first.'; exit 1; }
uv sync --project backend --frozen
npm ci --prefix frontend --ignore-scripts
npm --prefix frontend run build
printf '\nProofline is ready. Start with: python3 scripts/serve.py\n'
