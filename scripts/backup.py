#!/usr/bin/env python3
"""Consistent SQLite backup using SQLite's online backup API, not a file copy."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--database", type=Path, default=ROOT / ".local/proofline.sqlite3")
parser.add_argument("--output", type=Path)
args = parser.parse_args()
if not args.database.is_file():
    parser.error("database does not exist; run the app first")
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
output = args.output or ROOT / ".local/backups" / f"proofline-{stamp}.sqlite3"
if output.exists():
    parser.error("backup target already exists; choose a new path")
output.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True) as source:
    with sqlite3.connect(output) as target:
        source.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("backup failed integrity check")
print(f"Verified backup: {output}")
