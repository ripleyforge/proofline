"""Portable investigation brief with immutable evidence and honest provenance."""

import html
import re

from proofline.models import (
    BriefCoverage,
    CoverageCount,
    Hypothesis,
    IncidentBrief,
    IncidentDetail,
    IncidentSummary,
    Investigation,
    Note,
)
from proofline.service import LIMITATIONS, now
from proofline.storage import IncidentSnapshot


def literal(text: str) -> str:
    # Exports must not turn evidence text into active HTML or Markdown image/link URLs.
    return re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", html.escape(text, quote=False))


def markdown(run: Investigation) -> str:
    lines = [
        "# Proofline investigation brief",
        "",
        f"Incident: {literal(run.incident_id)}",
        f"Run: {run.id}",
        f"Created: {run.created_at}",
        f"Strategy: {run.strategy} | Mode: {run.mode} | Status: {run.status}",
        "",
        "## Question",
        "",
        literal(run.question),
        "",
        "## Answer",
        "",
        literal(run.answer),
        "",
        "## Claims and citations",
        "",
    ]
    for claim in run.claims:
        lines += [
            f"- {literal(claim.text)}",
            f"  - Source: {literal(claim.evidence_id)}",
            f"  - Quote integrity: {'passed' if claim.verified else 'not verified'}",
            f"  - Exact excerpt: {literal(claim.quote)}",
            "",
        ]
    lines += ["## Source provenance", ""]
    for source in run.citations:
        lines += [
            f"### {literal(source.id)} — {literal(source.title)}",
            "",
            f"Kind: {source.kind}; service: {literal(source.service)}; "
            f"timestamp: {source.timestamp}; "
            f"trusted: {source.trusted}",
            "",
            literal(source.body),
            "",
        ]
    lines += ["## Limitations", "", *[f"- {literal(item)}" for item in run.warnings], ""]
    return "\n".join(lines)


def incident_brief(incident: IncidentDetail, snapshot: IncidentSnapshot) -> IncidentBrief:
    """Collect saved work without inference; preserve historical run citation snapshots."""
    scoped = {source.id: source for source in incident.evidence}
    runs, notes, hypotheses, sources = [], [], [], {}
    excluded = False
    for raw in snapshot.investigations.items:
        run = Investigation.model_validate(raw)
        citation_ids = {source.id for source in run.citations}
        if (
            run.incident_id != incident.id
            or any(
                source.incident_id != incident.id or source.id not in scoped
                for source in run.citations
            )
            or any(claim.evidence_id not in citation_ids for claim in run.claims)
        ):
            excluded = True
            continue
        runs.append(run)
        for source in run.citations:
            # Newest run wins if a corpus revision changed the same source's text.
            sources.setdefault(source.id, source)
    for raw in snapshot.notes.items:
        note = Note.model_validate(raw)
        if note.incident_id != incident.id:
            excluded = True
            continue
        references = [source_id for source_id in note.evidence_ids if source_id in scoped]
        if references != note.evidence_ids:
            excluded = True
            note = note.model_copy(update={"evidence_ids": references})
        notes.append(note)
        for source_id in references:
            source = scoped[source_id]
            # A manually referenced untrusted source must retain its current trust label.
            if source_id not in sources or not source.trusted:
                sources[source_id] = source
    for raw in snapshot.hypotheses.items:
        hypothesis = Hypothesis.model_validate(raw)
        if hypothesis.incident_id != incident.id:
            excluded = True
            continue
        references = {
            field: [source_id for source_id in getattr(hypothesis, field) if source_id in scoped]
            for field in ("supporting_evidence_ids", "challenging_evidence_ids")
        }
        if any(references[field] != getattr(hypothesis, field) for field in references):
            excluded = True
            hypothesis = hypothesis.model_copy(update=references)
        hypotheses.append(hypothesis)
        for source_id in [
            *hypothesis.supporting_evidence_ids,
            *hypothesis.challenging_evidence_ids,
        ]:
            source = scoped[source_id]
            if source_id not in sources or not source.trusted:
                sources[source_id] = source
    limitations = [
        "This handoff records saved observations and does not synthesize a root cause.",
        LIMITATIONS,
        "Notes and hypotheses are user-authored content. Hypothesis statuses are analyst "
        "judgments, not verified conclusions. Manually referenced untrusted sources remain labeled "
        "trusted: false and do not become verified evidence.",
        "Hypotheses are never added to source evidence or model context. This handoff includes "
        "only their current revisions; full revision history remains in the local workbench.",
        "Saved local-mode prose is model output; its interpretations may be unsupported.",
        "Run citations retain saved source snapshots; note and hypothesis references resolve "
        "against the current corpus. "
        "The deduplicated source list favors the newest run snapshot, unless a manually "
        "referenced source is currently untrusted.",
    ]
    for name, selection in (
        ("investigations", snapshot.investigations),
        ("notes", snapshot.notes),
        ("hypotheses", snapshot.hypotheses),
    ):
        omitted = selection.total - len(selection.items)
        if omitted:
            limitations.append(f"{omitted} older {name} omitted from this bounded handoff.")
    if excluded:
        limitations.append(
            "Records or references outside this incident were excluded from the handoff."
        )
    return IncidentBrief(
        generated_at=now(),
        incident=IncidentSummary.model_validate(
            incident.model_dump(include=set(IncidentSummary.model_fields))
        ),
        coverage=BriefCoverage(
            investigations=CoverageCount(included=len(runs), total=snapshot.investigations.total),
            notes=CoverageCount(included=len(notes), total=snapshot.notes.total),
            hypotheses=CoverageCount(included=len(hypotheses), total=snapshot.hypotheses.total),
        ),
        investigations=runs,
        notes=notes,
        hypotheses=hypotheses,
        sources=list(sources.values()),
        limitations=limitations,
    )


def brief_markdown(brief: IncidentBrief) -> str:
    incident = brief.incident
    lines = [
        "# Proofline incident handoff",
        "",
        f"Generated: {brief.generated_at}",
        "",
        f"## {literal(incident.title)}",
        "",
        f"Incident: {literal(incident.id)}; service: {literal(incident.service)}; "
        f"severity: {incident.severity}; status: {incident.status}",
        f"Started: {incident.start_time}",
        "",
        literal(incident.summary),
        "",
        "## Coverage",
        "",
    ]
    for name, coverage in (
        ("Investigations", brief.coverage.investigations),
        ("Notes", brief.coverage.notes),
        ("Hypotheses", brief.coverage.hypotheses),
    ):
        lines.append(
            f"- {name}: {coverage.included} included of {coverage.total}; "
            f"{coverage.total - coverage.included} omitted."
        )
    lines += ["", "## Saved investigations", ""]
    if not brief.investigations:
        lines += ["No saved investigations included.", ""]
    for run in brief.investigations:
        lines += [
            f"### Run {literal(run.id)}",
            "",
            f"Created: {run.created_at}; mode: {run.mode}; strategy: {run.strategy}; "
            f"status: {run.status}",
            "",
            "Question:",
            "",
            literal(run.question),
            "",
            "Saved observation:",
            "",
            literal(run.answer),
            "",
        ]
        for claim in run.claims:
            lines += [
                f"- Claim: {literal(claim.text)}",
                f"  - Source: {literal(claim.evidence_id)}",
                f"  - Quote integrity: {'passed' if claim.verified else 'not verified'}",
                f"  - Exact excerpt: {literal(claim.quote)}",
                "",
            ]
        lines += [f"- Run limitation: {literal(warning)}" for warning in run.warnings]
        lines.append("")
    lines += ["## Saved notes", ""]
    if not brief.notes:
        lines += ["No saved notes included.", ""]
    for note in brief.notes:
        lines += [
            f"### Note {literal(note.id)}",
            "",
            f"Created: {note.created_at}",
            "",
            literal(note.body),
            "",
            "Evidence references: "
            + (", ".join(literal(item) for item in note.evidence_ids) or "none"),
            "",
        ]
    lines += ["## Current hypotheses", ""]
    if not brief.hypotheses:
        lines += ["No saved hypotheses included.", ""]
    sources = {source.id: source for source in brief.sources}
    for hypothesis in brief.hypotheses:
        lines += [
            f"### Hypothesis {literal(hypothesis.id)}",
            "",
            f"Revision: {hypothesis.revision}; analyst status: {literal(hypothesis.status)}",
            f"Created: {hypothesis.created_at}; updated: {hypothesis.updated_at}",
            "",
            "Statement:",
            "",
            literal(hypothesis.statement),
            "",
            "Rationale:",
            "",
            literal(hypothesis.rationale) or "Not recorded.",
            "",
            "Next check:",
            "",
            literal(hypothesis.next_check) or "Not recorded.",
            "",
        ]
        for label, references in (
            ("Supporting evidence", hypothesis.supporting_evidence_ids),
            ("Challenging evidence", hypothesis.challenging_evidence_ids),
        ):
            lines.append(f"{label}:")
            lines.append("")
            lines.extend(
                f"- {literal(source_id)}; trusted: {sources[source_id].trusted}"
                for source_id in references
            )
            if not references:
                lines.append("None recorded.")
            lines.append("")
    lines += ["## Referenced sources", ""]
    for source in brief.sources:
        lines += [
            f"### {literal(source.id)} — {literal(source.title)}",
            "",
            f"Kind: {source.kind}; service: {literal(source.service)}; "
            f"timestamp: {source.timestamp}; trusted: {source.trusted}",
            "",
            literal(source.body),
            "",
        ]
    lines += ["## Limitations", "", *[f"- {literal(item)}" for item in brief.limitations], ""]
    return "\n".join(lines)
