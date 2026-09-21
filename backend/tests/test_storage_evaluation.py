import json
import sqlite3

import pytest

from proofline.app import create_app
from proofline.corpus import Corpus
from proofline.evaluation import evaluate
from proofline.export import literal
from proofline.models import Note
from proofline.retrieval import BM25Retriever
from proofline.storage import SQLiteStore


def test_sqlite_parameterization_and_append_only(tmp_path):
    path = tmp_path / "records.sqlite3"
    store = SQLiteStore(path)
    note = Note(
        id="note-a",
        incident_id="incident-a",
        body="'); DROP TABLE records; --",
        evidence_ids=[],
        created_at="2026-04-14T14:00:00Z",
    )
    store.save("note", note)
    assert store.get("note", "' OR 1=1 --") is None
    assert SQLiteStore(path).get("note", "note-a") == note.model_dump()
    with pytest.raises(sqlite3.IntegrityError):
        store.save("note", note)
    assert store.list("note", "' OR 1=1 --") == []


def test_list_limits_and_newest_order(tmp_path):
    store = SQLiteStore(tmp_path / "records.sqlite3")
    for number in range(105):
        store.save(
            "note",
            Note(
                id=f"note-{number}",
                incident_id="incident-a",
                body="note",
                evidence_ids=[],
                created_at="2026-04-14T14:00:00Z",
            ),
        )
    records = store.list("note", limit=1000)
    assert len(records) == 100 and records[0]["id"] == "note-104"


def test_future_database_version_rejected(tmp_path):
    path = tmp_path / "future.sqlite3"
    with sqlite3.connect(path) as connection:
        connection.execute("PRAGMA user_version = 99")
    with pytest.raises(ValueError, match="newer"):
        SQLiteStore(path)


def test_eval_failures_report_actual_metrics(settings):
    class EmptyRetriever:
        def retrieve(self, *args):
            return []

    corpus = Corpus.load(settings.corpus_path)
    result = evaluate(
        corpus, corpus.load_evaluations(settings.evaluation_path), "bm25", EmptyRetriever()
    )
    assert result.passed < result.total
    assert result.metrics.retrieval_recall == 0
    assert result.metrics.citation_validity == 0
    assert result.metrics.abstention_accuracy == pytest.approx(2 / 3)


def test_eval_fixture_cross_incident_expected_source_rejected(settings):
    cases = json.loads(settings.evaluation_path.read_text())
    cases[0]["expected_evidence_ids"] = ["b-retry-change"]
    settings.evaluation_path.write_text(json.dumps(cases))
    with pytest.raises(ValueError, match="belong"):
        create_app(settings)


def test_markdown_untrusted_links_and_html_remain_literal():
    rendered = literal("<script>alert(1)</script> ![track](https://evil.example/image)")
    assert "<script>" not in rendered
    assert "![track](" not in rendered


def test_eval_reproducible_except_ids_and_timing(settings):
    corpus = Corpus.load(settings.corpus_path)
    fixtures = corpus.load_evaluations(settings.evaluation_path)
    first = evaluate(corpus, fixtures, "focused", BM25Retriever())
    second = evaluate(corpus, fixtures, "focused", BM25Retriever())
    assert first.id != second.id
    assert first.metrics == second.metrics
    assert [(case.id, case.passed, case.detail) for case in first.cases] == [
        (case.id, case.passed, case.detail) for case in second.cases
    ]
