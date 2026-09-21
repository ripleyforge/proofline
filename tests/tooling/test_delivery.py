"""Behavioral tests for local backup and deterministic packaging."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import types
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = ROOT / ".local" / "test-delivery"


def load_package_module() -> types.ModuleType:
    """Load the checked-in package script without invoking its CLI entry point."""
    name = f"proofline_package_{uuid.uuid4().hex}"
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / "package.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load scripts/package.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeliveryToolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        TEST_ROOT.mkdir(parents=True, exist_ok=True)

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="case-", dir=TEST_ROOT)
        self.addCleanup(temporary.cleanup)
        self.temporary = Path(temporary.name)

    def run_backup(self, database: Path, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "backup.py"),
                "--database",
                str(database),
                "--output",
                str(output),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def git(self, repository: Path, *arguments: str) -> str:
        result = subprocess.run(
            ["git", *arguments],
            cwd=repository,
            text=True,
            capture_output=True,
            check=True,
        )
        return result.stdout.strip()

    def make_repository(self, *, tracked_symlink: bool = False) -> Path:
        repository = self.temporary / "repository"
        (repository / "src").mkdir(parents=True)
        (repository / "frontend" / "dist").mkdir(parents=True)
        (repository / "src" / "app.py").write_text("print('synthetic proofline')\n")
        (repository / "frontend" / "dist" / "index.html").write_text(
            "<!doctype html><title>Proofline fixture</title>\n"
        )
        self.git(repository, "init", "--quiet")
        self.git(repository, "config", "user.name", "Proofline Tests")
        self.git(repository, "config", "user.email", "proofline-tests@example.invalid")
        self.git(repository, "config", "core.hooksPath", "/dev/null")
        if tracked_symlink:
            (repository / "linked-app.py").symlink_to("src/app.py")
        self.git(repository, "add", "src/app.py")
        if tracked_symlink:
            self.git(repository, "add", "linked-app.py")
        self.git(repository, "commit", "--quiet", "-m", "test fixture")
        return repository

    def test_backup_reads_consistent_wal_state_and_preserves_committed_note(self) -> None:
        database = self.temporary / "live.sqlite3"
        output = self.temporary / "backups" / "snapshot.sqlite3"
        with sqlite3.connect(database) as live:
            self.assertEqual(live.execute("PRAGMA journal_mode=WAL").fetchone()[0], "wal")
            live.execute("PRAGMA wal_autocheckpoint=0")
            live.execute("CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL)")
            live.commit()
            live.execute(
                "INSERT INTO notes (id, body) VALUES (?, ?)",
                ("note-committed", "Committed while the WAL connection remains open"),
            )
            live.commit()
            wal = database.with_name(database.name + "-wal")
            self.assertTrue(wal.is_file())
            self.assertGreater(wal.stat().st_size, 0)

            result = self.run_backup(database, output)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Verified backup:", result.stdout)
        with sqlite3.connect(output) as backup:
            self.assertEqual(backup.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(
                backup.execute("SELECT id, body FROM notes").fetchall(),
                [("note-committed", "Committed while the WAL connection remains open")],
            )

    def test_backup_rejects_missing_source_and_existing_target(self) -> None:
        output = self.temporary / "backup.sqlite3"
        missing = self.run_backup(self.temporary / "missing.sqlite3", output)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("database does not exist", missing.stderr)

        database = self.temporary / "live.sqlite3"
        with sqlite3.connect(database) as connection:
            connection.execute("CREATE TABLE marker (value TEXT)")
        output.write_bytes(b"preserve-existing-target")
        refused = self.run_backup(database, output)
        self.assertNotEqual(refused.returncode, 0)
        self.assertIn("backup target already exists", refused.stderr)
        self.assertEqual(output.read_bytes(), b"preserve-existing-target")

    def test_package_is_deterministic_and_manifest_covers_only_intended_files(self) -> None:
        repository = self.make_repository()
        (repository / ".env").write_text("DEMO_VALUE=" + "sk-" + "x" * 32 + "\n")
        local_database = repository / ".local" / "proofline.sqlite3"
        local_database.parent.mkdir()
        local_database.write_bytes(b"untracked local database")

        package = load_package_module()
        package.ROOT = repository
        first = package.build()
        first_bytes = first.read_bytes()
        second = package.build()

        self.assertEqual(first, second)
        self.assertEqual(first_bytes, second.read_bytes())
        with tarfile.open(second, "r:gz") as archive:
            members = {member.name: member for member in archive.getmembers()}
            self.assertIn("proofline/src/app.py", members)
            self.assertIn("proofline/frontend/dist/index.html", members)
            self.assertIn("proofline/MANIFEST.json", members)
            self.assertNotIn("proofline/.env", members)
            self.assertNotIn("proofline/.local/proofline.sqlite3", members)
            self.assertTrue(all(member.mtime == 0 for member in members.values()))
            manifest_file = archive.extractfile("proofline/MANIFEST.json")
            self.assertIsNotNone(manifest_file)
            manifest = json.loads(manifest_file.read())
            self.assertEqual(manifest["revision"], self.git(repository, "rev-parse", "HEAD"))
            self.assertEqual(
                set(manifest["files"]),
                {"src/app.py", "frontend/dist/index.html"},
            )
            for name, expected_digest in manifest["files"].items():
                packaged_file = archive.extractfile("proofline/" + name)
                self.assertIsNotNone(packaged_file)
                self.assertEqual(hashlib.sha256(packaged_file.read()).hexdigest(), expected_digest)

        archive_digest = hashlib.sha256(second.read_bytes()).hexdigest()
        checksum = second.with_suffix(second.suffix + ".sha256").read_text()
        self.assertEqual(checksum, f"{archive_digest}  {second.name}\n")

    def test_package_preserves_executable_launchers(self) -> None:
        repository = self.make_repository()
        launcher = repository / "Proofline.command"
        launcher.write_text("#!/bin/sh\necho Proofline\n")
        launcher.chmod(0o755)
        self.git(repository, "add", "Proofline.command")
        self.git(repository, "commit", "--quiet", "-m", "add launcher")
        package = load_package_module()
        package.ROOT = repository
        with tarfile.open(package.build(), "r:gz") as archive:
            self.assertEqual(archive.getmember("proofline/Proofline.command").mode, 0o755)
            self.assertEqual(archive.getmember("proofline/src/app.py").mode, 0o644)

    def test_package_rejects_dirty_tracked_source(self) -> None:
        repository = self.make_repository()
        (repository / "src" / "app.py").write_text("print('dirty source')\n")
        package = load_package_module()
        package.ROOT = repository

        with self.assertRaises(subprocess.CalledProcessError):
            package.build()

        self.assertFalse((repository / ".local" / "releases").exists())

    def test_package_refuses_tracked_symlink_entries(self) -> None:
        repository = self.make_repository(tracked_symlink=True)
        package = load_package_module()
        package.ROOT = repository

        with self.assertRaisesRegex(SystemExit, "Refusing non-regular package entry: linked-app.py"):
            package.build()


if __name__ == "__main__":
    unittest.main()
