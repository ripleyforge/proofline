"""Portable investigation brief with immutable evidence and honest provenance."""

import html
import re

from proofline.models import Investigation


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
