"""Portable investigation brief with immutable evidence and honest provenance."""

import html
import re

from proofline.models import (
    BriefCoverage,
    CoverageCount,
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
    runs, notes, sources = [], [], {}
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
    limitations = [
        "This handoff records saved observations and does not synthesize a root cause.",
        LIMITATIONS,
        "Notes are user-authored content. Manually referenced untrusted sources remain labeled "
        "trusted: false and do not become verified evidence.",
        "Saved local-mode prose is model output; its interpretations may be unsupported.",
        "Run citations retain saved source snapshots; note-only references use the current corpus. "
        "The deduplicated source list favors the newest run snapshot, unless a manually "
        "referenced source is currently untrusted.",
    ]
    for name, selection in (("investigations", snapshot.investigations), ("notes", snapshot.notes)):
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
        ),
        investigations=runs,
        notes=notes,
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
