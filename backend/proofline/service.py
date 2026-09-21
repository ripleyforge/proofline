"""Investigation workflow; HTTP and persistence do not determine answer content."""

from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from proofline.generation import Generator
from proofline.models import IncidentDetail, Investigation, InvestigationInput, Trace
from proofline.retrieval import Retriever
from proofline.validation import validate_claims

LIMITATIONS = (
    "Citation verification checks source, incident, trust, and exact quote integrity; "
    "it does not establish semantic correctness or root cause."
)
ABSTENTION = (
    "Insufficient supported evidence to answer this question. "
    "Review the incident sources or ask a more specific question."
)


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def elapsed(start: float) -> float:
    return round((perf_counter() - start) * 1000, 3)


def investigate(
    incident: IncidentDetail,
    request: InvestigationInput,
    retriever: Retriever,
    generator: Generator,
) -> Investigation:
    start = perf_counter()
    sources = retriever.retrieve(incident, request.question, request.strategy)
    # Treat injected retrievers as a substitution seam, not a trust bypass.
    eligible = {item.id: item for item in incident.evidence if item.trusted}
    sources = [eligible[item.id] for item in sources if item.id in eligible][:5]
    trace = [
        Trace(
            step="retrieval",
            detail=(
                f"{request.strategy}: {len(sources)} trusted sources within this incident; "
                "BM25 requires 40% query coverage. Focused adds service/tag and kind priors."
            ),
            duration_ms=elapsed(start),
        )
    ]
    generation_start = perf_counter()
    proposed = generator.generate(request.question, sources) if sources else []
    trace.append(
        Trace(
            step="generation",
            detail=(
                f"{request.mode}: {len(proposed)} candidate claims. "
                + ("No generation invoked: no relevant sources." if not sources else "")
            ),
            duration_ms=elapsed(generation_start),
        )
    )
    validation_start = perf_counter()
    claims, warnings = validate_claims(incident, proposed, {item.id for item in sources})
    citations = list({claim.evidence_id: eligible[claim.evidence_id] for claim in claims}.values())
    trace.append(
        Trace(
            step="validation",
            detail=(
                f"{len(claims)} claims retained; {len(warnings)} rejected. "
                "Exact quote integrity only."
            ),
            duration_ms=elapsed(validation_start),
        )
    )
    warnings.append(LIMITATIONS)
    if request.mode == "local":
        warnings.append(
            "Claim prose is local model output and may contain unsupported interpretations."
        )
    else:
        warnings.append("Extractive mode returns source excerpts; no language model was used.")
    if any(not item.trusted for item in incident.evidence):
        warnings.append("Known untrusted imported evidence was excluded from answer context.")
    return Investigation(
        id=uuid4().hex,
        incident_id=incident.id,
        question=request.question,
        strategy=request.strategy,
        mode=request.mode,
        status="answered" if claims else "abstained",
        answer="\n\n".join(claim.text for claim in claims) if claims else ABSTENTION,
        claims=claims,
        citations=citations,
        warnings=warnings,
        trace=trace,
        created_at=now(),
        duration_ms=elapsed(start),
    )
