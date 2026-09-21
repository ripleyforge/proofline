"""Append-only JSON records in SQLite; SQL parameters carry all user content."""

import sqlite3
from pathlib import Path
from typing import Literal, Protocol

from proofline.models import Model

RecordKind = Literal["investigation", "note", "evaluation"]


class Store(Protocol):
    def save(self, kind: RecordKind, record: Model) -> None: ...

    def get(self, kind: RecordKind, record_id: str) -> dict | None: ...

    def list(
        self, kind: RecordKind, incident_id: str | None = None, limit: int | None = 100
    ) -> list[dict]: ...


class SQLiteStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > 1:
                raise ValueError("database version is newer than this application")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS records ("
                "kind TEXT NOT NULL, id TEXT PRIMARY KEY, incident_id TEXT, "
                "created_at TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS records_listing "
                "ON records(kind, incident_id, created_at DESC)"
            )
            connection.execute("PRAGMA user_version = 1")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=5)

    def save(self, kind: RecordKind, record: Model) -> None:
        value = record.model_dump()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO records(kind,id,incident_id,created_at,payload) VALUES (?,?,?,?,?)",
                (
                    kind,
                    value["id"],
                    value.get("incident_id"),
                    value["created_at"],
                    record.model_dump_json(),
                ),
            )

    def get(self, kind: RecordKind, record_id: str) -> dict | None:
        import json

        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM records WHERE kind=? AND id=?", (kind, record_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def list(
        self, kind: RecordKind, incident_id: str | None = None, limit: int | None = 100
    ) -> list[dict]:
        import json

        query = "SELECT payload FROM records WHERE kind=?"
        params: list[str | int] = [kind]
        if incident_id is not None:
            query += " AND incident_id=?"
            params.append(incident_id)
        query += " ORDER BY created_at DESC, rowid DESC"
        if limit is not None:
            query += " LIMIT ?"
            params.append(max(1, min(limit, 100)))
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [json.loads(row[0]) for row in rows]
