import pytest

from proofline.generation import ExtractiveGenerator
from proofline.models import InvestigationInput
from proofline.retrieval import BM25Retriever
from proofline.service import investigate


@pytest.mark.parametrize("strategy", ["bm25", "focused"])
def test_inspection_matches_context_actually_sent_to_generation(incident, strategy):
    question = "Payment retry attempts change"
    retriever = BM25Retriever()
    inspection = retriever.inspect(incident, question)
    ranked = sorted(
        (item for item in inspection.candidates if getattr(item, f"{strategy}_rank") is not None),
        key=lambda item: getattr(item, f"{strategy}_rank"),
    )[: inspection.limit]
    received = []

    class RecordingGenerator(ExtractiveGenerator):
        def generate(self, question, evidence):
            received.extend(item.id for item in evidence)
            return super().generate(question, evidence)

    run = investigate(
        incident,
        InvestigationInput(incident_id=incident.id, question=question, strategy=strategy),
        retriever,
        RecordingGenerator(),
    )
    assert received == [item.evidence_id for item in ranked]
    assert [item.evidence_id for item in ranked] == [item.id for item in run.citations]
    assert inspection.query_tokens == ["attempts", "change", "payment", "retry"]
    assert inspection.admitted


def test_untrusted_documents_never_affect_scores_coverage_or_context(incident):
    retriever = BM25Retriever()
    clean = incident.model_copy(update={"evidence": [e for e in incident.evidence if e.trusted]})
    question = "Payment retry attempts"
    clean_result = retriever.inspect(clean, question)
    result = retriever.inspect(incident, question)
    assert [e for e in result.candidates if e.trusted] == clean_result.candidates
    attack = next(e for e in result.candidates if not e.trusted)
    assert attack.exclusion_reason == "untrusted"
    assert attack.matched_terms == [] and attack.coverage == 0
    assert attack.bm25_score == attack.focused_score == 0
    assert attack.bm25_rank is attack.focused_rank is None
    excluded = retriever.inspect(incident, "ZEBRA_OVERRIDE")
    assert not excluded.admitted and excluded.max_coverage == 0


@pytest.mark.parametrize(
    ("question", "reason"),
    [("what is the", "empty_query"), ("payment telescope galaxy nebula", "below_coverage")],
)
def test_inspector_explains_query_rejection(incident, question, reason):
    result = BM25Retriever().inspect(incident, question)
    assert not result.admitted
    assert all(e.exclusion_reason == reason for e in result.candidates if e.trusted)
    assert all(e.bm25_rank is None and e.focused_rank is None for e in result.candidates)


def test_global_coverage_gate_and_per_source_positive_overlap_are_distinct(incident):
    result = BM25Retriever().inspect(incident, "payment retry gateway stable")
    assert result.admitted
    assert result.max_coverage >= result.coverage_threshold
    change = next(e for e in result.candidates if e.evidence_id == "a-retry-change")
    assert change.coverage == 0.5 and change.bm25_rank is not None
    # One trusted source clears the gate, so a weaker matching source can rank.
    result = BM25Retriever().inspect(incident, "payment retry gateway unknown unknown2")
    gateway = next(e for e in result.candidates if e.evidence_id == "a-latency")
    assert result.max_coverage == result.coverage_threshold
    assert gateway.coverage == 0.2 and gateway.bm25_rank is not None


def test_no_overlap_source_is_excluded_even_after_query_admission(incident):
    result = BM25Retriever().inspect(incident, "gateway")
    source = next(e for e in result.candidates if e.evidence_id == "a-retry-change")
    assert result.admitted and source.exclusion_reason == "no_overlap"
    assert source.bm25_rank is None


def test_tied_ranks_are_stable_and_show_sources_outside_top_five(incident):
    template = incident.evidence[0]
    sources = [
        template.model_copy(update={"id": f"tie-{number}", "title": "Same", "body": "Retry budget"})
        for number in reversed(range(8))
    ]
    tied = incident.model_copy(update={"evidence": sources})
    retriever = BM25Retriever()
    result = retriever.inspect(tied, "retry")
    assert [e.id for e in retriever.retrieve(tied, "retry", "focused")] == [
        f"tie-{number}" for number in range(5)
    ]
    assert [e.focused_rank for e in result.candidates] == list(range(1, 9))


def test_focused_score_exposes_exact_multipliers(incident):
    result = BM25Retriever().inspect(incident, "payment retry deployment")
    change = next(e for e in result.candidates if e.evidence_id == "a-retry-change")
    metric = next(e for e in result.candidates if e.evidence_id == "a-retry-metric")
    assert change.context_boost == 1.15 and change.kind_boost == 1.25
    assert metric.kind_boost == 1
    assert change.focused_score == pytest.approx(change.bm25_score * 1.15 * 1.25)


def test_inspect_api_does_not_generate_or_persist(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Inspection must not generate or save records")

    monkeypatch.setattr(ExtractiveGenerator, "generate", forbidden)
    monkeypatch.setattr(client.app.state.store, "save", forbidden)
    response = client.post(
        "/api/retrieval/inspect",
        json={
            "incident_id": "incident-a",
            "question": "  Payment retries  ",
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["incident_id"] == "incident-a" and result["question"] == "Payment retries"
    assert all(e["evidence_id"].startswith("a-") for e in result["candidates"])
    assert client.get("/api/investigations").json() == []


@pytest.mark.parametrize(
    "body",
    [
        {"incident_id": "incident-a", "question": " "},
        {"incident_id": "incident-a", "question": "x" * 1001},
        {"incident_id": "incident-a", "question": "retry", "mode": "local"},
    ],
)
def test_inspection_rejects_invalid_input(client, body):
    assert client.post("/api/retrieval/inspect", json=body).status_code == 422


def test_inspection_unknown_incident(client):
    assert (
        client.post(
            "/api/retrieval/inspect",
            json={
                "incident_id": "missing",
                "question": "Payment",
            },
        ).status_code
        == 404
    )
