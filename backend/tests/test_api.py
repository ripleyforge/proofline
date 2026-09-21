from fastapi.testclient import TestClient

from proofline.app import create_app
from proofline.generation import ProviderError


def create_run(client, **overrides):
    body = {"incident_id": "incident-a", "question": "How did payment retry attempts change?"}
    return client.post("/api/investigations", json=body | overrides)


def test_full_investigation_notes_export_and_restart(client, settings):
    assert client.get("/api/health").json()["storage"] == "sqlite"
    assert len(client.get("/api/incidents").json()) == 2
    assert len(client.get("/api/incidents/incident-a").json()["evidence"]) == 5
    response = create_run(client)
    assert response.status_code == 201, response.text
    run = response.json()
    assert run["status"] == "answered" and all(item["verified"] for item in run["claims"])
    assert all(item["text"] == item["quote"] for item in run["claims"])
    note_response = client.post(
        "/api/incidents/incident-a/notes",
        json={
            "body": "Review retry budget; '); DROP TABLE records; --",
            "evidence_ids": ["a-retry-change", "a-retry-change"],
        },
    )
    assert note_response.status_code == 201
    assert note_response.json()["evidence_ids"] == ["a-retry-change"]
    assert len(client.get("/api/investigations?incident_id=incident-a").json()) == 1
    assert client.get("/api/investigations?incident_id=incident-b").json() == []
    assert client.get(f"/api/investigations/{run['id']}/export?format=json").json() == run
    exported = client.get(f"/api/investigations/{run['id']}/export?format=markdown")
    assert "attachment" in exported.headers["content-disposition"]
    assert "semantic correctness" in exported.text and "source excerpts" in exported.text
    with TestClient(create_app(settings), base_url="http://localhost") as reopened:
        assert reopened.get(f"/api/investigations/{run['id']}").json() == run
        assert reopened.get("/api/incidents/incident-a/notes").json()[0] == note_response.json()


def test_local_unavailable_is_explicit_not_fallback(client):
    config = client.get("/api/config").json()
    assert config["generation_modes"] == ["extractive"]
    assert not config["local_model"]["available"]
    response = create_run(client, mode="local")
    assert response.status_code == 503 and "detail" in response.json()
    assert client.get("/api/investigations").json() == []


def test_bad_input_and_cross_incident_note_references(client):
    assert create_run(client, question=" ").status_code == 422
    assert create_run(client, question="x" * 1001).status_code == 422
    assert create_run(client, model="cloud").status_code == 422
    assert create_run(client, incident_id="absent").status_code == 404
    assert (
        client.post(
            "/api/incidents/incident-a/notes",
            json={
                "body": "wrong scope",
                "evidence_ids": ["b-retry-change"],
            },
        ).status_code
        == 422
    )
    assert client.post("/api/incidents/absent/notes", json={"body": "test"}).status_code == 404
    assert client.get("/api/investigations/absent").status_code == 404


def test_reject_unsafe_host_origin_and_body(client):
    assert client.get("/api/health", headers={"host": "evil.example"}).status_code == 400
    assert client.get("/api/health", headers={"host": "localhost.evil.example"}).status_code == 400
    for origin in ["https://evil.example", "null", "http://127.0.0.1:9999"]:
        assert (
            client.post("/api/evaluations", json={}, headers={"origin": origin}).status_code == 403
        )
    assert (
        client.post(
            "/api/evaluations",
            json={},
            headers={
                "origin": "http://127.0.0.1:8100",
            },
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/evaluations",
            content="{}",
            headers={
                "content-type": "text/plain",
            },
        ).status_code
        == 415
    )
    assert (
        client.post(
            "/api/evaluations",
            content="x" * 33000,
            headers={
                "content-type": "application/json",
            },
        ).status_code
        == 413
    )


def test_evaluation_executes_and_persists_without_model(client):
    result = client.post("/api/evaluations", json={"strategy": "focused"})
    assert result.status_code == 201, result.text
    evaluation = result.json()
    assert evaluation["passed"] == evaluation["total"] == 7
    assert all(value == 1.0 for value in evaluation["metrics"].values())
    assert client.get("/api/evaluations").json() == [evaluation]
    assert client.get("/api/investigations").json() == []


def test_release_static_routes_do_not_hide_api_errors(client, settings):
    settings.frontend_dist.mkdir()
    (settings.frontend_dist / "index.html").write_text("<html>Proofline</html>")
    (settings.frontend_dist / "app.js").write_text("const ready = true;")
    assert client.get("/").status_code == 200
    assert client.get("/workspace/incident-a").status_code == 200
    assert client.get("/app.js").status_code == 200
    assert client.get("/missing.js").status_code == 404
    response = client.get("/api/missing")
    assert response.status_code == 404 and response.json()["detail"] == "API route not found."
    assert client.get("/api").status_code == 404


def test_newest_first_and_abstention_persist(client):
    first = create_run(client).json()
    second = create_run(client, question="Which satellite measured rain?").json()
    assert second["status"] == "abstained" and second["claims"] == []
    assert [run["id"] for run in client.get("/api/investigations").json()] == [
        second["id"],
        first["id"],
    ]


def test_provider_failure_is_actionable_and_does_not_save_a_run(settings):
    class FailingLocal:
        def availability(self):
            return True, "Available"

        def generate(self, question, evidence):
            raise ProviderError("Local model request timed out. Try again.")

        def close(self):
            pass

    with TestClient(
        create_app(settings, generator=FailingLocal()), base_url="http://127.0.0.1"
    ) as client:
        assert client.get("/api/config").json()["generation_modes"] == ["extractive", "local"]
        response = create_run(client, mode="local")
        assert response.status_code == 503 and "timed out" in response.json()["detail"]
        assert client.get("/api/investigations").json() == []
        assert create_run(client, mode="extractive").status_code == 201
