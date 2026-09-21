#!/usr/bin/env python3
"""Launch the built single-origin demo. No daemon, cloud calls or package installs."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8100)
    parser.add_argument("--dev", action="store_true", help="API reload for frontend development")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    if not shutil.which("uv"):
        parser.error("uv is required; run the setup instructions in README.md")
    if not args.dev and not (ROOT / "frontend/dist/index.html").exists():
        parser.error("built frontend missing; run bash scripts/setup.sh first")
    env = os.environ.copy()
    env.setdefault("PROOFLINE_DB_PATH", str(ROOT / ".local/proofline.sqlite3"))
    command = ["uv", "run", "--project", str(ROOT / "backend"), "--frozen", "--no-sync", "uvicorn", "proofline.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(args.port)]
    if args.dev:
        command += ["--reload", "--reload-dir", str(ROOT / "backend/proofline")]
    print(f"Proofline: http://127.0.0.1:{args.port} (Ctrl+C to stop)", flush=True)
    try:
        return subprocess.call(command, cwd=ROOT, env=env)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
