# Investigation reasoning tools

## Problem and scope

An exact quotation can still accompany an unsupported interpretation. The local
model experiment also confused missing evidence with contradiction. Proofline
therefore keeps source validation deterministic and gives the investigator tools
to compare evidence, record reasoning, and inspect retrieval decisions.

Three increments extend the existing local workflow without new dependencies,
cloud services, model downloads, or autonomous actions:

1. **Hypotheses:** user-authored explanations with supporting and challenging
   source references, a next check, and an explicit analyst status. Persist full
   immutable revisions and reject stale edits instead of overwriting another tab.
   Include current hypotheses in the incident handoff.
2. **Evidence comparison:** choose up to two incident sources and read them side
   by side, preserving timestamps, services, and trust labels. This is visual
   comparison, not automatic conflict detection.
3. **Retrieval inspector:** run a read-only comparison of BM25 and focused ranking
   using the same scoring implementation as investigations. Expose query tokens,
   source coverage, boosts, ranks, and exclusion reasons. Scores are relevance
   signals, never truth probabilities.

## Hypothesis contract

`HypothesisInput`: `{statement, status, rationale, next_check,
supporting_evidence_ids, challenging_evidence_ids}`. Statement is nonblank,
max 500 characters. Rationale and next check allow empty strings, max 4000 and
1000 respectively. Status is `open|supported|ruled_out`; all are analyst judgments.
Each reference list contains at most 30 unique source IDs in the same incident.
One source cannot appear on both sides. Untrusted references remain inspectable
and explicitly labeled; they never enter model context through this feature.

`Hypothesis` adds `{id,incident_id,revision,created_at,updated_at}`. Revision starts
at 1. `PUT` supplies all input fields plus `expected_revision`. A stale revision
returns 409, missing hypothesis 404, invalid references/input 422. The UI preserves
the unsaved edit on conflict and offers an explicit reload. No last-write-wins.

- GET/POST `/api/incidents/{id}/hypotheses`: current hypotheses / create (201).
- PUT `/api/incidents/{id}/hypotheses/{hypothesis_id}`: append revision (200).
- GET `/api/incidents/{id}/hypotheses/{hypothesis_id}/revisions`: newest first.

Lists are bounded to the latest 100 hypotheses and latest 100 revisions; return
`{items,total}` so truncation is visible. Handoff schema version 2 adds
`hypotheses` and `coverage.hypotheses`, latest 50 current records from the same
SQLite read snapshot as runs and notes. Old runs/notes/evaluations remain intact.
Database schema is additive; use atomic version-checked appends. Never import
hypotheses into source evidence or retrieve them as established facts.

## Retrieval inspection contract

POST `/api/retrieval/inspect`, body `{incident_id,question}` (same question limits
as investigation), returns `{incident_id,question,query_tokens,coverage_threshold,
max_coverage,admitted,limit,candidates}`. It does not save a run or call a model.
Candidates are ordered by evidence timestamp then ID and contain:
`{evidence_id,trusted,matched_terms,coverage,bm25_score,context_boost,kind_boost,
focused_score,bm25_rank,focused_rank,exclusion_reason}`. Ranks are 1-based over
positive-scoring trusted candidates when the corpus-wide 40% coverage gate passes;
ranks beyond 5 are outside the returned context. A null rank is excluded.
Exclusion reasons are `untrusted|empty_query|below_coverage|no_overlap|null`.
Untrusted text does not influence tokens, document frequencies, coverage, or boosts.

The inspector is attached to the current question and resets when it or the
incident changes. Source links open the existing evidence drawer. The interface
states that a global coverage gate admits retrieval; individual returned sources
may cover fewer than 40% of query terms. There is no separate approximate scorer.

## Verification and boundaries

Test revision conflicts/atomicity, restart persistence, incident isolation, input
limits, legacy database compatibility, export scope/escaping/coverage, and no
generation on inspect. Ranking tests check actual investigation context matches
inspection ranks, including ties, thresholds, untrusted sources, and empty queries.
Browser tests cover the full hypothesis/revision/handoff workflow, conflicts,
evidence comparison, retrieval inspection, failure states, narrow layouts and
keyboard access. Run the existing integrated gate and one independent review.

Keep the existing Ember palette, square controls and restrained glass navigation.
Prefer clear labels and progressive disclosure over another dashboard of scores.
No claim of model accuracy, root-cause proof, production security, or AWS deployment.
