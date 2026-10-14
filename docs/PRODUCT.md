# Proofline

## Customer problem

An engineer taking over an incident needs to distinguish what happened, what is merely suspected, and which source supports each statement. Dashboards show signals; a chat answer can hide its weak evidence. Proofline keeps the evidence and the investigation together, with repeatable tests of the assistant's behavior.

Primary user: an on-call engineer investigating a synthetic commerce service.
Secondary user: a solutions engineer demonstrating failure behavior and tradeoffs.

## Product scope

1. Open one of four seeded incidents, inspect a service dependency map, time-series signals and an ordered timeline of changes, logs, metrics, and runbooks. Compare two sources without losing timestamps or trust labels.
2. Ask a suggested or custom question. Compare plain BM25 retrieval with focused retrieval that incorporates explicit incident context and evidence kind.
3. Get deterministic extracts immediately or opt into installed local Ollama generation. See the actual mode, trace, latency, warnings, and cited excerpts.
4. Reject unknown citations and altered quotes. Abstain when evidence is weak. Exclude known untrusted notes from generation; adversarial tests show limits.
5. Keep incident-specific drafts across switches/reloads, save notes with evidence references, and find older runs through filtered, paginated history.
6. Run a real evaluation suite and inspect each pass/failure, not just a score.
7. Export individual runs or an incident handoff in Markdown or JSON. Handoffs include saved notes, source provenance, limitations and explicit inclusion/omission counts. Restart the app and retain saved work in SQLite.
8. Maintain hypotheses with analyst status, evidence for and against, a next check, and revision history. Reject stale edits from other tabs. Include the latest hypothesis state in handoffs without treating it as established evidence.
9. Explain retrieval using a read-only inspector: query tokens, coverage gate, source scores/ranks, focused boosts, and exclusion reasons come from the same scorer as investigations.

No real incident integrations, autonomous remediation, multi-user authentication, production-grade security claim, remote model API, or paid service is in v1.

## Acceptance

- Fresh documented setup reaches a functioning demo with no account or key.
- Every primary UI action works, with useful empty/loading/error states.
- Unsupported questions and malicious evidence produce safe bounded behavior.
- Data and exports survive restart; input is validated and parameterized.
- Tests cover retrieval ranking, source isolation, claim validation, API/storage, provider failure, workflows, accessibility basics and responsive layout.
- CI checks the shipped applications; reviewed synthetic source can be published under owner authorization; working local release command, rollback path, concise demo and interview guide.

## Career alignment

AWS Associate Solutions Architect / Associate Delivery Consultant: requirements, architecture tradeoffs, cost boundaries, observability, customer demonstration.
Applied AI Emerging Talent: retrieval, structured output, evaluations, failure handling, React UX, Python API and persistent state. This is new portfolio work; it does not imply prior production AI or AWS delivery experience.
