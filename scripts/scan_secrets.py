#!/usr/bin/env python3
"""Small dependency-free tracked text guard; supplements local Gitleaks review."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
RULES = [
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("GitHub credential", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{40,}")),
    ("credential assignment", re.compile(r"(?i)(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*[\"'][A-Za-z0-9_+/=-]{24,}[\"']")),
]
files = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
failures = []
count = 0
for name in filter(None, files):
    path = ROOT / name
    if not path.is_file():
        continue
    data = path.read_bytes()
    if b"\0" in data:
        continue
    count += 1
    text = data.decode("utf-8", errors="replace")
    for label, pattern in RULES:
        if pattern.search(text):
            failures.append(f"{name}: possible {label} (redacted)")
if failures:
    print("\n".join(failures))
    sys.exit(1)
print(f"Tracked text secret guard: {count} files, no matching credentials.")
