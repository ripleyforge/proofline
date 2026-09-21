import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from proofline.app import create_app
from proofline.generation import ExtractiveGenerator
from proofline.models import InvestigationInput, Note
from proofline.retrieval import BM25Retriever
from proofline.service import investigate
from proofline.storage import SQLiteStore


def save_runs(settings, incident, count=125):
    store = SQLiteStore(settings.db_path)
    base = investigate(
        incident,
        InvestigationInput(incident_id=incident.id, question="Payment retry attempts"),
        BM25Retriever(),
        ExtractiveGenerator(),
    )
    for index in range(count):
        store.save(
            "investigation",
            base.model_copy(
                update={
                    "id": f"{incident.id}-run-{index}",
                    "question": f"Payment retry {index}",
                    "mode": "local" if index % 2 else "extractive",
                    "status": "abstained" if index % 3 == 0 else "answered",
                    # A shared timestamp proves insertion-order tie handling.
                    "created_at": "2026-04-14T14:00:00Z",
                    "answer": "Saved observation. " * 40,
                }
            ),
        )
    return store, base


def test_history_pages_more_than_100_without_full_run_payload(client, settings, incident):
    save_runs(settings, incident)
    first = client.get("/api/investigations/page").json()
    assert first["total"] == 125 and first["limit"] == 20 and first["offset"] == 0
    assert first["items"][0]["id"] == "incident-a-run-124"
    assert len(first["items"][0]["answer_preview"]) == 220
    assert set(first["items"][0]) == {
        "id",
        "incident_id",
        "question",
        "strategy",
        "mode",
        "status",
        "answer_preview",
        "created_at",
        "duration_ms",
    }
    ids = []
    for offset in range(0, 125, 20):
        page = client.get("/api/investigations/page", params={"offset": offset}).json()
        ids.extend(item["id"] for item in page["items"])
    assert len(ids) == len(set(ids)) == 125 and ids[-1] == "incident-a-run-0"
    old_response = client.get("/api/investigations")
    assert len(old_response.json()) == 100  # Existing route remains compatible.
    assert len(json.dumps(first)) < len(old_response.content) / 10
    assert client.get(f"/api/investigations/{ids[-1]}").json()["claims"]
    beyond = client.get("/api/investigations/page?offset=125").json()
    assert beyond["items"] == [] and beyond["total"] == 125


def test_history_filters_are_combined_scoped_and_question_only(client, settings, corpus):
    save_runs(settings, corpus.get("incident-a"), 12)
    save_runs(settings, corpus.get("incident-b"), 12)
    page = client.get(
        "/api/investigations/page",
        params={
            "incident_id": "incident-a",
            "q": "  PAYMENT  ",
            "status": "answered",
            "mode": "local",
        },
    ).json()
    assert page["total"] == 4
    assert {item["incident_id"] for item in page["items"]} == {"incident-a"}
    assert all(item["status"] == "answered" and item["mode"] == "local" for item in page["items"])
    assert client.get("/api/investigations/page?q=Saved%20observation").json()["total"] == 0


@pytest.mark.parametrize(
    "question,q",
    [
        ("Retry was 100%", "%"),
        ("Check payment_id", "_"),
        (r"Path a\b", "\\"),
        ("Customer's retry", "'"),
        ("Straße latency", "STRASSE"),
    ],
)
def test_question_search_is_literal_and_case_insensitive(client, settings, incident, question, q):
    store, base = save_runs(settings, incident, 3)
    store.save("investigation", base.model_copy(update={"id": "literal", "question": question}))
    result = client.get("/api/investigations/page", params={"q": q}).json()
    assert result["total"] == 1 and result["items"][0]["id"] == "literal"
    assert client.get("/api/investigations/page", params={"q": "' OR 1=1 --"}).json()["total"] == 0


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 101},
        {"offset": -1},
        {"offset": str(2**64)},
        {"limit": "1.5"},
        {"q": "x" * 201},
        {"status": "pending"},
        {"mode": "cloud"},
    ],
)
def test_history_invalid_input_is_422(client, params):
    assert client.get("/api/investigations/page", params=params).status_code == 422


def test_history_unknown_incident_and_empty_results(client):
    assert client.get("/api/investigations/page?incident_id=unknown").status_code == 404
    response = client.get("/api/investigations/page?limit=100&offset=0&q=%20%20")
    assert response.json() == {"items": [], "total": 0, "limit": 100, "offset": 0}
    assert client.get("/api/investigations/page", params={"q": " " * 250}).status_code == 200
    assert client.get("/api/investigations/page", params={"offset": 2**63 - 1}).status_code == 200


def test_brief_includes_counts_scoped_sources_and_untrusted_note_references(
    client, settings, corpus
):
    store, _ = save_runs(settings, corpus.get("incident-a"), 25)
    save_runs(settings, corpus.get("incident-b"), 3)
    for index in range(55):
        store.save(
            "note",
            Note(
                id=f"note-{index}",
                incident_id="incident-a",
                body=f"Observation {index}",
                evidence_ids=["a-attack", "a-retry-change"],
                created_at="2026-04-14T14:00:00Z",
            ),
        )
    store.save(
        "note",
        Note(
            id="other-note",
            incident_id="incident-b",
            body="other incident only",
            evidence_ids=["b-attack"],
            created_at="2026-04-14T14:00:00Z",
        ),
    )
    before = settings.db_path.read_bytes()
    result = client.get("/api/incidents/incident-a/brief?format=json")
    assert result.status_code == 200
    brief = result.json()
    assert brief["schema_version"] == 1 and brief["incident"]["id"] == "incident-a"
    assert brief["coverage"] == {
        "investigations": {"included": 20, "total": 25},
        "notes": {"included": 50, "total": 55},
    }
    assert brief["investigations"][0]["id"] == "incident-a-run-24"
    assert brief["notes"][0]["id"] == "note-54"
    assert all(
        item["incident_id"] == "incident-a"
        for item in [
            *brief["investigations"],
            *brief["notes"],
            *brief["sources"],
        ]
    )
    assert len({item["id"] for item in brief["sources"]}) == len(brief["sources"])
    assert next(item for item in brief["sources"] if item["id"] == "a-attack")["trusted"] is False
    assert any("5 older investigations" in item for item in brief["limitations"])
    assert any("5 older notes" in item for item in brief["limitations"])
    assert settings.db_path.read_bytes() == before  # Export itself performs no persistent writes.


def test_brief_markdown_is_readable_literal_content(client, settings, incident):
    store, _ = save_runs(settings, incident, 1)
    store.save(
        "note",
        Note(
            id="malicious",
            incident_id=incident.id,
            body="Customer's retry wasn't charged twice.\n# Override\n<script>bad</script> ![beacon](https://evil.example)\n[link](javascript:evil)",
            evidence_ids=["a-attack"],
            created_at="2026-04-14T14:00:00Z",
        ),
    )
    response = client.get("/api/incidents/incident-a/brief")
    assert response.status_code == 200
    assert 'filename="proofline-incident-a-brief.md"' in response.headers["content-disposition"]
    content = response.text
    assert "Customer's retry wasn't charged twice" in content
    assert "<script>" not in content and "&lt;script&gt;" in content
    assert "![beacon](" not in content and "[link](javascript:" not in content
    assert "\n# Override" not in content and "trusted: False" in content
    assert "Exact excerpt:" in content and "local" not in response.headers["content-disposition"]
    assert "not synthesize a root cause" in content


def test_brief_empty_and_invalid_requests(client):
    result = client.get("/api/incidents/incident-a/brief?format=json").json()
    assert result["investigations"] == result["notes"] == result["sources"] == []
    assert result["coverage"]["investigations"] == {"included": 0, "total": 0}
    assert client.get("/api/incidents/unknown/brief").status_code == 404
    assert client.get("/api/incidents/incident-a/brief?format=html").status_code == 422


def test_old_database_is_preserved_and_global_listing_index_added(settings, incident):
    store, _ = save_runs(settings, incident, 2)
    with sqlite3.connect(settings.db_path) as connection:
        connection.execute("DROP INDEX records_global_listing")
        before = connection.execute("SELECT * FROM records ORDER BY rowid").fetchall()
    reopened = SQLiteStore(settings.db_path)
    with sqlite3.connect(settings.db_path) as connection:
        assert connection.execute("SELECT * FROM records ORDER BY rowid").fetchall() == before
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
        indexes = connection.execute("PRAGMA index_list(records)").fetchall()
    assert any(row[1] == "records_global_listing" for row in indexes)
    assert len(reopened.list("investigation")) == len(store.list("investigation")) == 2


def test_brief_rechecks_scope_of_persisted_nested_references(client, settings, corpus):
    store, base = save_runs(settings, corpus.get("incident-a"), 1)
    foreign = corpus.get("incident-b").evidence[0]
    store.save(
        "investigation",
        base.model_copy(
            update={
                "id": "invalid-scope",
                "citations": [foreign],
                "answer": "Foreign evidence must not export",
            }
        ),
    )
    store.save(
        "note",
        Note(
            id="mixed-refs",
            incident_id="incident-a",
            body="Manually saved note",
            evidence_ids=["a-attack", foreign.id],
            created_at="2026-04-14T14:00:00Z",
        ),
    )
    brief = client.get("/api/incidents/incident-a/brief?format=json").json()
    assert brief["coverage"]["investigations"] == {"included": 1, "total": 2}
    assert brief["notes"][0]["evidence_ids"] == ["a-attack"]
    assert all(source["incident_id"] == "incident-a" for source in brief["sources"])
    assert "Foreign evidence must not export" not in json.dumps(brief)
    assert any("outside this incident" in item for item in brief["limitations"])
    # Export exclusion must not rewrite the saved record.
    assert store.get("investigation", "invalid-scope")["citations"][0]["id"] == foreign.id


def test_brief_and_history_do_not_consult_model(settings, incident):
    class NoModelCalls:
        def availability(self):
            raise AssertionError("read-only history/export must not probe a model")

        def generate(self, question, evidence):
            raise AssertionError("read-only history/export must not generate content")

        def close(self):
            pass

    save_runs(settings, incident, 1)
    with TestClient(
        create_app(settings, generator=NoModelCalls()), base_url="http://127.0.0.1"
    ) as client:
        assert client.get("/api/investigations/page").status_code == 200
        assert client.get("/api/incidents/incident-a/brief").status_code == 200
