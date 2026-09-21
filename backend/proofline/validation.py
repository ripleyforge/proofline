"""Citation integrity only: these checks do not establish semantic entailment."""

from proofline.models import Claim, IncidentDetail


def validate_claims(
    incident: IncidentDetail, claims: list[Claim], allowed_ids: set[str] | None = None
) -> tuple[list[Claim], list[str]]:
    sources = {item.id: item for item in incident.evidence}
    valid, warnings = [], []
    seen: set[tuple[str, str]] = set()
    for claim in claims:
        source = sources.get(claim.evidence_id)
        reason = None
        if source is None or source.incident_id != incident.id:
            reason = "unknown or out-of-incident evidence"
        elif not source.trusted:
            reason = "untrusted evidence"
        elif allowed_ids is not None and source.id not in allowed_ids:
            reason = "evidence outside retrieved context"
        elif not claim.quote.strip() or claim.quote not in source.body:
            reason = "quote is not an exact source excerpt"
        if reason:
            warnings.append(f"Dropped claim: {reason}.")
            continue
        identity = (claim.evidence_id, claim.quote)
        if identity not in seen:
            valid.append(claim.model_copy(update={"verified": True}))
            seen.add(identity)
    return valid, warnings
