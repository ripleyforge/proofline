#!/usr/bin/env python3
"""Build a deterministic source + frontend bundle; no upload or cloud deployment."""
from __future__ import annotations
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def build() -> Path:
    subprocess.run(["git", "diff", "--exit-code", "HEAD", "--"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    if not (ROOT / "frontend/dist/index.html").is_file():
        raise SystemExit("Build the frontend before packaging.")
    names = [name for name in tracked if name and not name.startswith(".github/")]
    names += [str(f.relative_to(ROOT)) for f in (ROOT / "frontend/dist").rglob("*") if f.is_file()]
    files = {}
    for name in sorted(set(names)):
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise SystemExit(f"Refusing non-regular package entry: {name}")
        files[name] = source.read_bytes()
    manifest = {
        "schema_version": 1,
        "project": "Proofline",
        "revision": revision,
        "delivery": "local-source-and-built-interface",
        "requirements": "Python >=3.12, uv, dependencies from backend/uv.lock; Node needed only for rebuilding or testing",
        "files": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
    }
    files["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    target = ROOT / ".local/releases" / f"proofline-{revision[:12]}.tar.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for name, data in files.items():
                    info = tarfile.TarInfo("proofline/" + name)
                    info.size = len(data)
                    info.mtime = 0
                    info.mode = 0o755 if name != "MANIFEST.json" and (ROOT / name).stat().st_mode & 0o111 else 0o644
                    archive.addfile(info, io.BytesIO(data))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(target.suffix + ".sha256").write_text(f"{digest}  {target.name}\n")
    (ROOT / ".local/releases/latest.txt").write_text(str(target) + "\n")
    print(f"Local bundle: {target}\nSHA-256: {digest}\nEntries: {len(files)} (tracked source and built interface; inspect MANIFEST.json before sharing)")
    return target


if __name__ == "__main__":
    build()
