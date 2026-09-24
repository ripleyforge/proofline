"""Append-only JSON records in SQLite; SQL parameters carry all user content."""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol

from proofline.models import (
    HistoryQuery,
    Hypothesis,
    HypothesisPage,
    HypothesisUpdate,
    InvestigationPage,
    Model,
)

RecordKind = Literal["investigation", "note", "evaluation"]


@dataclass(frozen=True)
class RecordSelection:
    items: list[dict]
    total: int


@dataclass(frozen=True)
class IncidentSnapshot:
    investigations: RecordSelection
    notes: RecordSelection
    hypotheses: RecordSelection


class HypothesisNotFound(Exception):
    pass


class HypothesisConflict(Exception):
    pass


class Store(Protocol):
    def save(self, kind: RecordKind, record: Model) -> None: ...

    def get(self, kind: RecordKind, record_id: str) -> dict | None: ...

    def list(
        self, kind: RecordKind, incident_id: str | None = None, limit: int | None = 100
    ) -> list[dict]: ...

    def investigations_page(self, query: HistoryQuery) -> InvestigationPage: ...

    def incident_snapshot(self, incident_id: str) -> IncidentSnapshot: ...

    def create_hypothesis(self, hypothesis: Hypothesis) -> None: ...

    def revise_hypothesis(
        self, incident_id: str, hypothesis_id: str, body: HypothesisUpdate, updated_at: str
    ) -> Hypothesis: ...

    def hypotheses_page(self, incident_id: str) -> HypothesisPage: ...

    def hypothesis_revisions(self, incident_id: str, hypothesis_id: str) -> HypothesisPage: ...


class SQLiteStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            version = connection.execute("PRAGMA user_version").fetchone()[0]
            if version > 2:
                raise ValueError("database version is newer than this application")
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS records ("
                "kind TEXT NOT NULL, id TEXT PRIMARY KEY, incident_id TEXT, "
                "created_at TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS records_listing "
                "ON records(kind, incident_id, created_at DESC)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS records_global_listing "
                "ON records(kind, created_at DESC)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS hypotheses ("
                "id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, "
                "revision INTEGER NOT NULL CHECK(revision >= 1), updated_at TEXT NOT NULL)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS hypotheses_listing "
                "ON hypotheses(incident_id, updated_at DESC)"
            )
            connection.execute(
                "CREATE TABLE IF NOT EXISTS hypothesis_revisions ("
                "hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id), "
                "revision INTEGER NOT NULL CHECK(revision >= 1), payload TEXT NOT NULL, "
                "PRIMARY KEY(hypothesis_id, revision))"
            )
            connection.execute("PRAGMA user_version = 2")

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.execute("PRAGMA foreign_keys = ON")
        # SQLite's built-in lower/LIKE folds ASCII only. This scalar function keeps
        # literal Unicode search in the SQL filter without materializing history.
        connection.create_function("casefold", 1, str.casefold, deterministic=True)
        return connection

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
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM records WHERE kind=? AND id=?", (kind, record_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def list(
        self, kind: RecordKind, incident_id: str | None = None, limit: int | None = 100
    ) -> list[dict]:
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

    def investigations_page(self, query: HistoryQuery) -> InvestigationPage:
        where = ["kind=?"]
        params: list[str | int] = ["investigation"]
        if query.incident_id is not None:
            where.append("incident_id=?")
            params.append(query.incident_id)
        if query.q:
            # instr is literal: %, _, backslashes and quotes never become patterns.
            where.append("instr(casefold(json_extract(payload, '$.question')), ?) > 0")
            params.append(query.q.casefold())
        for name, value in (("status", query.status), ("mode", query.mode)):
            if value is not None:
                where.append(f"json_extract(payload, '$.{name}')=?")
                params.append(value)
        clause = " AND ".join(where)
        projection = (
            "id, incident_id, json_extract(payload, '$.question') AS question, "
            "json_extract(payload, '$.strategy') AS strategy, "
            "json_extract(payload, '$.mode') AS mode, "
            "json_extract(payload, '$.status') AS status, "
            "substr(json_extract(payload, '$.answer'), 1, 220) AS answer_preview, "
            "created_at, json_extract(payload, '$.duration_ms') AS duration_ms"
        )
        with self._connect() as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("BEGIN")
            total = connection.execute(
                f"SELECT count(*) FROM records WHERE {clause}", params
            ).fetchone()[0]
            rows = connection.execute(
                f"SELECT {projection} FROM records WHERE {clause} "
                "ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
                [*params, query.limit, query.offset],
            ).fetchall()
        return InvestigationPage(
            items=[dict(row) for row in rows], total=total, limit=query.limit, offset=query.offset
        )

    def create_hypothesis(self, hypothesis: Hypothesis) -> None:
        if hypothesis.revision != 1:
            raise ValueError("A new hypothesis must start at revision 1.")
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO hypotheses(id,incident_id,revision,updated_at) VALUES (?,?,?,?)",
                (hypothesis.id, hypothesis.incident_id, 1, hypothesis.updated_at),
            )
            connection.execute(
                "INSERT INTO hypothesis_revisions(hypothesis_id,revision,payload) VALUES (?,?,?)",
                (hypothesis.id, 1, hypothesis.model_dump_json()),
            )

    def revise_hypothesis(
        self, incident_id: str, hypothesis_id: str, body: HypothesisUpdate, updated_at: str
    ) -> Hypothesis:
        # Hold the write reservation across reading the version, appending its successor,
        # and moving the current pointer. A second tab can never overwrite a stale read.
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT r.payload FROM hypotheses h JOIN hypothesis_revisions r "
                "ON r.hypothesis_id=h.id AND r.revision=h.revision "
                "WHERE h.id=? AND h.incident_id=?",
                (hypothesis_id, incident_id),
            ).fetchone()
            if row is None:
                raise HypothesisNotFound
            previous = Hypothesis.model_validate_json(row[0])
            if previous.revision != body.expected_revision:
                raise HypothesisConflict
            revised = Hypothesis(
                **body.model_dump(exclude={"expected_revision"}),
                id=previous.id,
                incident_id=previous.incident_id,
                revision=previous.revision + 1,
                created_at=previous.created_at,
                updated_at=updated_at,
            )
            connection.execute(
                "INSERT INTO hypothesis_revisions(hypothesis_id,revision,payload) VALUES (?,?,?)",
                (hypothesis_id, revised.revision, revised.model_dump_json()),
            )
            connection.execute(
                "UPDATE hypotheses SET revision=?,updated_at=? WHERE id=? AND incident_id=?",
                (revised.revision, updated_at, hypothesis_id, incident_id),
            )
        return revised

    @staticmethod
    def _hypotheses_selection(
        connection: sqlite3.Connection, incident_id: str, limit: int
    ) -> RecordSelection:
        total = connection.execute(
            "SELECT count(*) FROM hypotheses WHERE incident_id=?", (incident_id,)
        ).fetchone()[0]
        rows = connection.execute(
            "SELECT r.payload FROM hypotheses h JOIN hypothesis_revisions r "
            "ON r.hypothesis_id=h.id AND r.revision=h.revision "
            "WHERE h.incident_id=? ORDER BY h.updated_at DESC, h.rowid DESC LIMIT ?",
            (incident_id, limit),
        ).fetchall()
        return RecordSelection([json.loads(row[0]) for row in rows], total)

    def hypotheses_page(self, incident_id: str) -> HypothesisPage:
        with self._connect() as connection:
            connection.execute("BEGIN")
            selection = self._hypotheses_selection(connection, incident_id, 100)
        return HypothesisPage(items=selection.items, total=selection.total)

    def hypothesis_revisions(self, incident_id: str, hypothesis_id: str) -> HypothesisPage:
        with self._connect() as connection:
            connection.execute("BEGIN")
            found = connection.execute(
                "SELECT revision FROM hypotheses WHERE id=? AND incident_id=?",
                (hypothesis_id, incident_id),
            ).fetchone()
            if found is None:
                raise HypothesisNotFound
            rows = connection.execute(
                "SELECT payload FROM hypothesis_revisions WHERE hypothesis_id=? "
                "ORDER BY revision DESC LIMIT 100",
                (hypothesis_id,),
            ).fetchall()
        return HypothesisPage(items=[json.loads(row[0]) for row in rows], total=found[0])

    def incident_snapshot(self, incident_id: str) -> IncidentSnapshot:
        selections = []
        with self._connect() as connection:
            connection.execute("BEGIN")
            for kind, limit in (("investigation", 20), ("note", 50)):
                total = connection.execute(
                    "SELECT count(*) FROM records WHERE kind=? AND incident_id=?",
                    (kind, incident_id),
                ).fetchone()[0]
                rows = connection.execute(
                    "SELECT payload FROM records WHERE kind=? AND incident_id=? "
                    "ORDER BY created_at DESC, rowid DESC LIMIT ?",
                    (kind, incident_id, limit),
                ).fetchall()
                selections.append(RecordSelection([json.loads(row[0]) for row in rows], total))
            hypotheses = self._hypotheses_selection(connection, incident_id, 50)
        return IncidentSnapshot(
            investigations=selections[0], notes=selections[1], hypotheses=hypotheses
        )
