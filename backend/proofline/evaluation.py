"""Deterministic corpus evaluation and direct validator attacks, without model calls."""

from statistics import mean
from time import perf_counter
from uuid import uuid4

from proofline.corpus import Corpus
from proofline.generation import ExtractiveGenerator
from proofline.models import (
    Claim,
    Evaluation,
    EvaluationCase,
    EvaluationFixture,
    EvaluationMetrics,
    InvestigationInput,
    Strategy,
)
from proofline.retrieval import Retriever
from proofline.service import elapsed, investigate, now
from proofline.validation import validate_claims


def evaluate(
    corpus: Corpus, fixtures: list[EvaluationFixture], strategy: Strategy, retriever: Retriever
) -> Evaluation:
    start = perf_counter()
    cases = []
    recalls, abstentions, injections, validity = [], [], [], []
    for fixture in fixtures:
        case_start = perf_counter()
        incident = corpus.get(fixture.incident_id)
        run = investigate(
            incident,
            InvestigationInput(
                incident_id=incident.id, question=fixture.question, strategy=strategy
            ),
            retriever,
            ExtractiveGenerator(),
        )
        returned = {item.id for item in run.citations}
        expected = set(fixture.expected_evidence_ids)
        recall = len(expected & returned) / len(expected) if expected else 1.0
        if expected:
            recalls.append(recall)
        abstention_ok = (run.status == "abstained") == fixture.expect_abstain
        abstentions.append(float(abstention_ok))
        integrity = all(item.trusted and item.incident_id == incident.id for item in run.citations)
        validity.extend(float(claim.verified) for claim in run.claims)
        passed = recall == 1 and abstention_ok and integrity
        if fixture.category == "injection":
            injections.append(float(passed))
        cases.append(
            EvaluationCase(
                id=fixture.id,
                name=fixture.name,
                category=fixture.category,
                passed=passed,
                detail=(
                    f"Expected {sorted(expected)}; returned {sorted(returned)}. "
                    f"Recall {recall:.2f}; "
                    f"expected abstention={fixture.expect_abstain}, "
                    f"actual={run.status == 'abstained'}. "
                    "Recall metric is macro-average across fixtures with nonempty expected IDs."
                ),
                duration_ms=elapsed(case_start),
            )
        )
    # Exercise validator independently, so valid outputs cannot conceal a broken rejection path.
    incident = next(iter(corpus.incidents.values()))
    source = next((item for item in incident.evidence if item.trusted), None)
    if source:
        attacks = [
            ("unknown-source", Claim(text="Unsupported", evidence_id="unknown-source", quote="x")),
            (
                "altered-quote",
                Claim(
                    text="Unsupported",
                    evidence_id=source.id,
                    quote=source.body[:900] + " [fabricated quotation]",
                ),
            ),
        ]
        other = next(
            (
                item
                for entry in corpus.incidents.values()
                if entry.id != incident.id
                for item in entry.evidence
            ),
            None,
        )
        if other:
            attacks.append(
                (
                    "wrong-incident",
                    Claim(text="Unsupported", evidence_id=other.id, quote=other.body[:900]),
                )
            )
        untrusted = next((item for item in incident.evidence if not item.trusted), None)
        if untrusted:
            attacks.append(
                (
                    "untrusted-source",
                    Claim(text="Unsupported", evidence_id=untrusted.id, quote=untrusted.body[:900]),
                )
            )
        for name, attack in attacks:
            case_start = perf_counter()
            accepted, _ = validate_claims(incident, [attack])
            passed = not accepted
            injections.append(float(passed))
            cases.append(
                EvaluationCase(
                    id=f"validator-{name}",
                    name=f"Reject {name}",
                    category="validator",
                    passed=passed,
                    detail="Direct claim validation attack; no model invoked.",
                    duration_ms=elapsed(case_start),
                )
            )
    return Evaluation(
        id=uuid4().hex,
        strategy=strategy,
        passed=sum(case.passed for case in cases),
        total=len(cases),
        metrics=EvaluationMetrics(
            retrieval_recall=mean(recalls) if recalls else 0,
            citation_validity=mean(validity) if validity else 0,
            abstention_accuracy=mean(abstentions) if abstentions else 0,
            injection_resistance=mean(injections) if injections else 0,
        ),
        cases=cases,
        created_at=now(),
        duration_ms=elapsed(start),
    )
