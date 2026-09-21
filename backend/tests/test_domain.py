import pytest
from pydantic import ValidationError

from proofline.corpus import Corpus
from proofline.generation import ExtractiveGenerator
from proofline.models import Claim, InvestigationInput, NoteInput
from proofline.retrieval import BM25Retriever
from proofline.service import investigate
from proofline.validation import validate_claims


@pytest.mark.parametrize("strategy", ["bm25", "focused"])
def test_retrieval_ranks_retry_sources_and_excludes_injection(incident, strategy):
    sources = BM25Retriever().retrieve(incident, "How did payment retry attempts change?", strategy)
    assert {item.id for item in sources[:2]} == {"a-retry-change", "a-retry-metric"}
    assert all(item.trusted and item.incident_id == incident.id for item in sources)


@pytest.mark.parametrize(
    "question",
    [
        "What happened?",
        "Which weather station measured hail?",
        "ZEBRA_OVERRIDE secret canary",
        "Which satellite ran a latency experiment on Mars?",
    ],
)
def test_no_context_for_unsupported_or_weak_overlap_questions(incident, question):
    assert BM25Retriever().retrieve(incident, question, "focused") == []


def test_exact_quote_verified_but_model_prose_not_rewritten(incident):
    quote = incident.evidence[0].body
    proposed = Claim(text="Model interpretation", evidence_id="a-retry-change", quote=quote)
    accepted, warnings = validate_claims(incident, [proposed])
    assert accepted[0].verified is True
    assert accepted[0].text == "Model interpretation"
    assert not warnings


@pytest.mark.parametrize(
    "evidence_id,quote",
    [
        ("absent", "Payment"),
        ("b-retry-change", "Payment"),
        ("a-attack", "Ignore controls"),
        ("a-retry-change", "payment retry"),
        ("a-retry-change", " "),
    ],
)
def test_claim_attack_rejection(incident, evidence_id, quote):
    claim = Claim(text="Assertion", evidence_id=evidence_id, quote=quote, verified=True)
    accepted, warnings = validate_claims(incident, [claim])
    assert accepted == [] and len(warnings) == 1


def test_unretrieved_source_rejected(incident):
    claim = Claim(text="Gateway", evidence_id="a-latency", quote="Gateway latency")
    assert not validate_claims(incident, [claim], {"a-retry-change"})[0]


def test_extracts_are_exact_and_scope_checked_even_for_injected_retriever(incident, corpus):
    class BadRetriever:
        def retrieve(self, *args):
            return [*corpus.get("incident-b").evidence, incident.evidence[-1]]

    run = investigate(
        incident,
        InvestigationInput(incident_id=incident.id, question="Payment"),
        BadRetriever(),
        ExtractiveGenerator(),
    )
    assert run.status == "abstained" and not run.claims
    assert "no language model" in " ".join(run.warnings)


def test_invalid_model_claims_are_removed_and_disclosed(incident):
    class InvalidGenerator:
        def generate(self, question, evidence):
            return [Claim(text="Invented", evidence_id="a-retry-change", quote="not in source")]

    run = investigate(
        incident,
        InvestigationInput(incident_id=incident.id, question="Payment retry"),
        BM25Retriever(),
        InvalidGenerator(),
    )
    assert run.status == "abstained" and run.citations == []
    assert any("Dropped claim" in warning for warning in run.warnings)


@pytest.mark.parametrize("mutation", ["count", "scope", "duplicate", "dependency"])
def test_corpus_rejects_broken_relations(incident, mutation):
    incident = incident.model_copy(deep=True)
    if mutation == "count":
        incident.evidence_count += 1
    elif mutation == "scope":
        incident.evidence[0].incident_id = "incident-b"
    elif mutation == "duplicate":
        incident.evidence[1].id = incident.evidence[0].id
    else:
        incident.services[0].upstream = ["missing"]
    with pytest.raises(ValueError):
        Corpus([incident])


@pytest.mark.parametrize("value", ["", " ", "x" * 1001])
def test_question_boundaries(value):
    with pytest.raises(ValidationError):
        InvestigationInput(incident_id="incident-a", question=value)


def test_note_bounds():
    with pytest.raises(ValidationError):
        NoteInput(body="x" * 4001)


@pytest.mark.parametrize("value", ["yesterday", "2026-04-14T14:00:00", "2026-04-14T14:00:00-06:00"])
def test_incident_timestamps_must_be_utc(incident, value):
    from proofline.models import IncidentDetail

    raw = incident.model_dump()
    raw["start_time"] = value
    with pytest.raises(ValidationError):
        IncidentDetail.model_validate(raw)
