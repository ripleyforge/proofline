import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi.testclient import TestClient

from proofline.app import create_app
from proofline.models import Hypothesis, HypothesisUpdate
from proofline.storage import SQLiteStore

BASE = "/api/incidents/incident-a/hypotheses"
TIMESTAMP = "2026-04-14T14:00:00Z"


def hypothesis_input(**overrides):
    return {
        "statement": "The retry budget amplified checkout traffic.",
        "status": "open",
        "rationale": "The retry change and traffic increase coincide.",
        "next_check": "Compare rollback and traffic timestamps.",
        "supporting_evidence_ids": ["a-retry-change", "a-retry-metric"],
        "challenging_evidence_ids": ["a-latency"],
    } | overrides


def saved_hypothesis(hypothesis_id="hypothesis-a", **overrides):
    return Hypothesis(
        **(
            hypothesis_input()
            | {
                "id": hypothesis_id,
                "incident_id": "incident-a",
                "revision": 1,
                "created_at": TIMESTAMP,
                "updated_at": TIMESTAMP,
            }
            | overrides
        )
    )


def test_create_revise_and_restart_preserve_full_immutable_revisions(client, settings):
    assert client.get(BASE).json() == {"items": [], "total": 0}
    first_response = client.post(BASE, json=hypothesis_input(statement="  Retry amplification  "))
    assert first_response.status_code == 201, first_response.text
    first = first_response.json()
    assert first["statement"] == "Retry amplification"
    assert first["revision"] == 1 and first["created_at"] == first["updated_at"]
    update = hypothesis_input(
        status="supported",
        supporting_evidence_ids=["a-retry-metric"],
        challenging_evidence_ids=["a-attack"],
        rationale="Analyst interpretation only.",
    )
    second_response = client.put(f"{BASE}/{first['id']}", json=update | {"expected_revision": 1})
    assert second_response.status_code == 200, second_response.text
    second = second_response.json()
    assert {key: second[key] for key in update} == update
    assert second["id"] == first["id"] and second["created_at"] == first["created_at"]
    assert second["revision"] == 2 and second["updated_at"] >= first["updated_at"]
    assert "expected_revision" not in second
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as reopened:
        assert reopened.get(BASE).json() == {"items": [second], "total": 1}
        assert reopened.get(f"{BASE}/{first['id']}/revisions").json() == {
            "items": [second, first],
            "total": 2,
        }
        stale = reopened.put(
            f"{BASE}/{first['id']}", json=hypothesis_input() | {"expected_revision": 1}
        )
        assert stale.status_code == 409 and "Reload" in stale.json()["detail"]
        assert reopened.get(f"{BASE}/{first['id']}/revisions").json()["total"] == 2


@pytest.mark.parametrize("status", ["open", "supported", "ruled_out"])
def test_statuses_are_user_judgments_and_empty_optional_text_is_valid(client, status):
    response = client.post(
        BASE,
        json=hypothesis_input(
            status=status,
            rationale="",
            next_check="",
            supporting_evidence_ids=[],
            challenging_evidence_ids=[],
        ),
    )
    assert response.status_code == 201
    assert response.json()["status"] == status


@pytest.mark.parametrize(
    "overrides",
    [
        {"statement": ""},
        {"statement": " \n\t "},
        {"statement": "x" * 501},
        {"rationale": "x" * 4001},
        {"next_check": "x" * 1001},
        {"status": "confirmed"},
        {"supporting_evidence_ids": ["a-retry-change"] * 2},
        {"challenging_evidence_ids": ["a-latency"] * 2},
        {"challenging_evidence_ids": ["a-retry-change"]},
        {"supporting_evidence_ids": [f"source-{number}" for number in range(31)]},
        {"challenging_evidence_ids": [f"source-{number}" for number in range(31)]},
        {"supporting_evidence_ids": ["b-retry-change"]},
        {"challenging_evidence_ids": ["b-retry-change"]},
        {"supporting_evidence_ids": ["absent"]},
        {"supporting_evidence_ids": ["' OR 1=1 --"]},
        {"challenging_evidence_ids": ["<script>alert(1)</script>"]},
        {"supporting_evidence_ids": ["x" * 121]},
        {"revision": 9},
        {"incident_id": "incident-b"},
        {"expected_revision": 1},
    ],
)
def test_invalid_creation_is_422_without_writes(client, overrides):
    assert client.post(BASE, json=hypothesis_input(**overrides)).status_code == 422
    assert client.get(BASE).json() == {"items": [], "total": 0}


@pytest.mark.parametrize("field", list(hypothesis_input()))
def test_all_input_fields_are_required_on_create_and_update(client, field):
    first = client.post(BASE, json=hypothesis_input()).json()
    incomplete = hypothesis_input()
    del incomplete[field]
    assert client.post(BASE, json=incomplete).status_code == 422
    assert (
        client.put(
            f"{BASE}/{first['id']}",
            json=incomplete
            | {
                "expected_revision": 1,
            },
        ).status_code
        == 422
    )
    assert client.get(f"{BASE}/{first['id']}/revisions").json()["total"] == 1


@pytest.mark.parametrize("revision", [0, -1, 1.5, "1", True, None, 2**64])
def test_expected_revision_must_be_a_positive_integer(client, revision):
    first = client.post(BASE, json=hypothesis_input()).json()
    response = client.put(
        f"{BASE}/{first['id']}",
        json=hypothesis_input()
        | {
            "expected_revision": revision,
        },
    )
    assert response.status_code == 422
    assert client.get(f"{BASE}/{first['id']}/revisions").json()["total"] == 1


def test_update_requires_version_and_valid_scoped_references(client):
    first = client.post(BASE, json=hypothesis_input()).json()
    path = f"{BASE}/{first['id']}"
    assert client.put(path, json=hypothesis_input()).status_code == 422
    assert (
        client.put(
            path,
            json=hypothesis_input(supporting_evidence_ids=["b-retry-change"])
            | {"expected_revision": 1},
        ).status_code
        == 422
    )
    assert client.put(path, json=hypothesis_input() | {"expected_revision": 9}).status_code == 409
    assert client.get(f"{path}/revisions").json() == {"items": [first], "total": 1}


def test_lists_updates_and_history_are_incident_scoped(client):
    first = client.post(BASE, json=hypothesis_input()).json()
    foreign_base = "/api/incidents/incident-b/hypotheses"
    assert client.get(foreign_base).json() == {"items": [], "total": 0}
    update = hypothesis_input(supporting_evidence_ids=[], challenging_evidence_ids=[])
    assert (
        client.put(
            f"{foreign_base}/{first['id']}",
            json=update
            | {
                "expected_revision": 1,
            },
        ).status_code
        == 404
    )
    assert client.get(f"{foreign_base}/{first['id']}/revisions").status_code == 404
    assert client.get(f"{BASE}/absent/revisions").status_code == 404
    assert client.put(f"{BASE}/absent", json=update | {"expected_revision": 1}).status_code == 404
    assert client.get(f"{BASE}/%27%20OR%201=1%20--/revisions").status_code == 404
    unknown = "/api/incidents/unknown/hypotheses"
    assert client.get(unknown).status_code == 404
    assert client.post(unknown, json=update).status_code == 404
    assert (
        client.put(
            f"{unknown}/{first['id']}",
            json=update
            | {
                "expected_revision": 1,
            },
        ).status_code
        == 404
    )
    assert client.get(f"{unknown}/{first['id']}/revisions").status_code == 404
    assert client.get(f"{BASE}/{first['id']}/revisions").json()["items"] == [first]


def test_simultaneous_edits_have_one_winner_and_keep_original_revision(client, settings):
    first = client.post(BASE, json=hypothesis_input()).json()
    barrier = Barrier(2)
    # Two app instances own independent stores and SQLite connections, as after a restart.
    with (
        TestClient(create_app(settings), base_url="http://127.0.0.1") as second_client,
        ThreadPoolExecutor(max_workers=2) as executor,
    ):

        def edit(tab, statement):
            barrier.wait(timeout=5)
            return tab.put(
                f"{BASE}/{first['id']}",
                json=hypothesis_input(statement=statement) | {"expected_revision": 1},
            )

        futures = [
            executor.submit(edit, tab, statement)
            for tab, statement in (
                (client, "First tab's edit"),
                (second_client, "Second tab's edit"),
            )
        ]
        responses = [future.result(timeout=10) for future in futures]
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    assert client.get(BASE).json() == {"items": [winner], "total": 1}
    assert client.get(f"{BASE}/{first['id']}/revisions").json() == {
        "items": [winner, first],
        "total": 2,
    }


def test_failed_head_update_rolls_back_revision_append(client, settings):
    first = client.post(BASE, json=hypothesis_input()).json()
    with sqlite3.connect(settings.db_path) as connection:
        connection.execute(
            "CREATE TRIGGER fail_hypothesis_update BEFORE UPDATE ON hypotheses "
            "BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END"
        )
    response = client.put(
        f"{BASE}/{first['id']}",
        json=hypothesis_input()
        | {
            "expected_revision": 1,
        },
    )
    assert response.status_code == 503
    assert "simulated" not in response.text
    assert client.get(BASE).json() == {"items": [first], "total": 1}
    with sqlite3.connect(settings.db_path) as connection:
        assert connection.execute("SELECT count(*) FROM hypothesis_revisions").fetchone()[0] == 1
        connection.execute("DROP TRIGGER fail_hypothesis_update")
    retry = client.put(
        f"{BASE}/{first['id']}",
        json=hypothesis_input()
        | {
            "expected_revision": 1,
        },
    )
    assert retry.status_code == 200 and retry.json()["revision"] == 2


@pytest.mark.parametrize("legacy_version", [0, 1])
def test_additive_migration_preserves_legacy_runs_notes_and_evaluations(
    client, settings, legacy_version
):
    run = client.post(
        "/api/investigations",
        json={
            "incident_id": "incident-a",
            "question": "How did payment retry attempts change?",
        },
    ).json()
    note = client.post("/api/incidents/incident-a/notes", json={"body": "Legacy note"}).json()
    evaluation = client.post("/api/evaluations", json={}).json()
    with sqlite3.connect(settings.db_path) as connection:
        records_before = connection.execute("SELECT * FROM records ORDER BY rowid").fetchall()
        connection.execute("DROP TABLE hypothesis_revisions")
        connection.execute("DROP TABLE hypotheses")
        connection.execute(f"PRAGMA user_version = {legacy_version}")
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as reopened:
        assert reopened.get(f"/api/investigations/{run['id']}").json() == run
        assert reopened.get("/api/incidents/incident-a/notes").json() == [note]
        assert reopened.get("/api/evaluations").json() == [evaluation]
        assert reopened.get(BASE).json() == {"items": [], "total": 0}
        assert reopened.post(BASE, json=hypothesis_input()).status_code == 201
    with sqlite3.connect(settings.db_path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 2
        assert (
            connection.execute("SELECT * FROM records ORDER BY rowid").fetchall() == records_before
        )


def test_lists_and_exports_show_bounded_current_records_and_revision_totals(client, settings):
    store = SQLiteStore(settings.db_path)
    for index in range(105):
        store.create_hypothesis(saved_hypothesis(f"hypothesis-{index}"))
    for revision in range(1, 105):
        store.revise_hypothesis(
            "incident-a",
            "hypothesis-0",
            HypothesisUpdate(
                **hypothesis_input(status="supported"),
                expected_revision=revision,
            ),
            "2026-04-15T14:00:00Z",
        )
    page = client.get(BASE).json()
    assert page["total"] == 105 and len(page["items"]) == 100
    assert page["items"][0]["id"] == "hypothesis-0"
    assert page["items"][0]["revision"] == 105
    assert page["items"][1]["id"] == "hypothesis-104"
    revisions = client.get(f"{BASE}/hypothesis-0/revisions").json()
    assert revisions["total"] == 105 and len(revisions["items"]) == 100
    assert [item["revision"] for item in revisions["items"]] == list(range(105, 5, -1))
    brief = client.get("/api/incidents/incident-a/brief?format=json").json()
    assert brief["schema_version"] == 2
    assert brief["coverage"]["hypotheses"] == {"included": 50, "total": 105}
    assert len(brief["hypotheses"]) == len({item["id"] for item in brief["hypotheses"]}) == 50
    assert brief["hypotheses"][0] == page["items"][0]
    assert any("55 older hypotheses" in text for text in brief["limitations"])


def test_handoff_escapes_hypothesis_text_labels_trust_and_preserves_provenance(client, settings):
    content = (
        "Customer's hypothesis.\n# Override\n<script>bad</script> ![beacon](https://evil.example)"
    )
    first = client.post(
        BASE,
        json=hypothesis_input(
            statement=content,
            rationale=content,
            next_check=content,
            supporting_evidence_ids=["a-attack"],
            challenging_evidence_ids=["a-latency"],
        ),
    ).json()
    before = settings.db_path.read_bytes()
    brief = client.get("/api/incidents/incident-a/brief?format=json").json()
    assert brief["hypotheses"] == [first]
    assert brief["coverage"]["hypotheses"] == {"included": 1, "total": 1}
    source = next(item for item in brief["sources"] if item["id"] == "a-attack")
    assert source["trusted"] is False and source["incident_id"] == "incident-a"
    assert source["timestamp"] == TIMESTAMP and source["service"] == "checkout"
    assert any("analyst judgments" in text for text in brief["limitations"])
    markdown = client.get("/api/incidents/incident-a/brief").text
    assert "## Current hypotheses" in markdown and "Revision: 1; analyst status: open" in markdown
    assert markdown.count("&lt;script&gt;") == 3
    assert "<script>" not in markdown and "![beacon](" not in markdown
    assert "\n# Override" not in markdown
    assert "a\\-attack; trusted: False" in markdown
    assert "Supporting evidence:" in markdown and "Challenging evidence:" in markdown
    assert "Created:" in markdown and "updated:" in markdown
    assert settings.db_path.read_bytes() == before


def test_handoff_rechecks_persisted_hypothesis_scope_without_rewriting_revisions(client, settings):
    store = SQLiteStore(settings.db_path)
    mixed = saved_hypothesis(
        supporting_evidence_ids=["a-attack", "b-retry-change"],
        challenging_evidence_ids=["absent", "a-latency"],
    )
    store.create_hypothesis(mixed)
    store.create_hypothesis(
        saved_hypothesis(
            "foreign",
            incident_id="incident-b",
            statement="Other incident's private hypothesis",
            supporting_evidence_ids=[],
            challenging_evidence_ids=[],
        )
    )
    # Simulate an inconsistent persisted incident field without trusting it during export.
    wrong = saved_hypothesis("wrong-payload", statement="Wrong-scope payload must not export")
    store.create_hypothesis(wrong)
    with sqlite3.connect(settings.db_path) as connection:
        connection.execute(
            "UPDATE hypothesis_revisions SET payload=? WHERE hypothesis_id=?",
            (
                wrong.model_copy(update={"incident_id": "incident-b"}).model_dump_json(),
                wrong.id,
            ),
        )
    brief = client.get("/api/incidents/incident-a/brief?format=json").json()
    assert brief["coverage"]["hypotheses"] == {"included": 1, "total": 2}
    exported = brief["hypotheses"][0]
    assert exported["supporting_evidence_ids"] == ["a-attack"]
    assert exported["challenging_evidence_ids"] == ["a-latency"]
    assert all(source["incident_id"] == "incident-a" for source in brief["sources"])
    assert "Other incident" not in json.dumps(brief) and "Wrong-scope" not in json.dumps(brief)
    assert any("outside this incident" in text for text in brief["limitations"])
    assert store.hypothesis_revisions("incident-a", mixed.id).items == [mixed]


def test_handoff_uses_one_sqlite_snapshot_across_saved_work(settings, monkeypatch):
    store = SQLiteStore(settings.db_path)
    first = saved_hypothesis()
    store.create_hypothesis(first)
    writer = SQLiteStore(settings.db_path)
    with sqlite3.connect(settings.db_path) as connection:
        connection.execute("PRAGMA journal_mode = WAL")
    connect = store._connect
    writes = []

    def read_connection():
        connection = connect()

        def after_snapshot_begins(statement):
            # The first investigations SELECT establishes the snapshot. Before the notes
            # SELECT, commit a new hypothesis through an independent SQLite connection.
            if "SELECT count(*) FROM records" in statement and "'note'" in statement:
                writes.append(
                    writer.revise_hypothesis(
                        "incident-a",
                        first.id,
                        HypothesisUpdate(
                            **hypothesis_input(status="ruled_out"),
                            expected_revision=1,
                        ),
                        "2026-04-15T14:00:00Z",
                    )
                )

        connection.set_trace_callback(after_snapshot_begins)
        return connection

    monkeypatch.setattr(store, "_connect", read_connection)
    snapshot = store.incident_snapshot("incident-a")
    assert len(writes) == 1 and writes[0].revision == 2
    assert snapshot.hypotheses.items == [first.model_dump()]
    assert writer.hypotheses_page("incident-a").items[0].revision == 2


def test_hypotheses_never_call_a_model_or_become_retrieved_evidence(settings):
    class NoModelCalls:
        def availability(self):
            raise AssertionError("Hypotheses must not probe a model")

        def generate(self, question, evidence):
            raise AssertionError("Hypotheses must not generate content")

        def close(self):
            pass

    with TestClient(
        create_app(settings, generator=NoModelCalls()), base_url="http://127.0.0.1"
    ) as client:
        first = client.post(
            BASE,
            json=hypothesis_input(
                statement="ZEBRA_OVERRIDE secret canary",
                supporting_evidence_ids=["a-attack"],
                challenging_evidence_ids=[],
            ),
        ).json()
        assert (
            client.put(
                f"{BASE}/{first['id']}",
                json=hypothesis_input(
                    statement="ZEBRA_OVERRIDE secret canary remains an analyst hypothesis",
                    supporting_evidence_ids=["a-attack"],
                    challenging_evidence_ids=[],
                )
                | {
                    "expected_revision": 1,
                },
            ).status_code
            == 200
        )
        assert client.get(BASE).status_code == 200
        assert client.get(f"{BASE}/{first['id']}/revisions").status_code == 200
        assert client.get("/api/incidents/incident-a/brief").status_code == 200
        result = client.post(
            "/api/investigations",
            json={
                "incident_id": "incident-a",
                "question": "ZEBRA_OVERRIDE secret canary",
                "mode": "extractive",
            },
        ).json()
        assert result["status"] == "abstained" and result["citations"] == []
