#!/usr/bin/env python3
"""Extract, hash-check and boot the exact packaged demo in an isolated local folder."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    target = Path((ROOT / ".local/releases/latest.txt").read_text().strip())
    expected = target.with_suffix(target.suffix + ".sha256").read_text().split()[0]
    assert hashlib.sha256(target.read_bytes()).hexdigest() == expected, "archive checksum mismatch"
    with tempfile.TemporaryDirectory(prefix="bundle-check-", dir=ROOT / ".local") as temp:
        folder = Path(temp)
        with tarfile.open(target) as archive:
            archive.extractall(folder, filter="data")
        project = folder / "proofline"
        manifest = json.loads((project / "MANIFEST.json").read_text())
        for name, digest in manifest["files"].items():
            assert hashlib.sha256((project / name).read_bytes()).hexdigest() == digest, name
        subprocess.run(["uv", "sync", "--project", str(project / "backend"), "--frozen", "--no-dev"], check=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = os.environ.copy()
        env["PROOFLINE_DB_PATH"] = str(folder / "bundle-test.sqlite3")
        env["PROOFLINE_OLLAMA_MODEL"] = ""
        command = ["uv", "run", "--project", str(project / "backend"), "--frozen", "--no-sync", "uvicorn", "proofline.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port)]
        with (folder / "server.log").open("w") as log:
            server = subprocess.Popen(command, cwd=project, env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 20
                while True:
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1) as response:
                            assert json.load(response)["status"] == "ok"
                            break
                    except OSError:
                        if server.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError((folder / "server.log").read_text())
                        time.sleep(0.2)
                for route, contains in [("/", b"Proofline"), ("/api/incidents", b"evidence_count")]:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}{route}", timeout=5) as response:
                        assert contains.lower() in response.read().lower(), route
                print(f"Verified packaged revision {manifest['revision']}: checksums, isolated install, health, interface, incidents.")
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    main()
