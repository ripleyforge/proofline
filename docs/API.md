# API contract v1

All routes are under `/api`. JSON uses snake_case. Dates are ISO 8601 UTC strings.
Errors use `{ "detail": "actionable message" }`; validation errors may use FastAPI's standard detail list. IDs are opaque. Lists below are direct JSON arrays unless an object is explicitly specified. No API credentials. Same-origin, loopback use.

## Data

`Evidence`: `{id, incident_id, kind, timestamp, title, body, service, trusted}`.
kind is `metric|log|change|runbook|note`. trusted is boolean, false indicates known untrusted imported content, excluded from answer context (still inspectable).

`IncidentSummary`: `{id,title,service,severity,status,start_time,summary,tags,evidence_count}`.
severity is `SEV2|SEV3`; status is `investigating|monitoring`; tags is string[].

`IncidentDetail`: all summary fields plus `evidence: Evidence[]`, `metrics: [{name,unit,threshold?:number,points:[{time,value}]}]`, `services: [{id,label,status,upstream:string[]}]`, and `suggested_questions:string[]`.
service status is `healthy|degraded|failed`. Data file `data/incidents.json` is an array of IncidentDetail. Cross-incident evidence IDs are globally unique.

`Claim`: `{text,evidence_id,quote,verified}`. Verification checks that the evidence belongs to the current incident, is trusted, and contains the quote verbatim.
Extractive mode uses the quote as text. Generated prose is explicitly model output, even when quote integrity passes; do not label semantic correctness as verified.

`Investigation`: `{id,incident_id,question,strategy,mode,status,answer,claims,citations,warnings,trace,created_at,duration_ms}`. strategy is `bm25|focused`; mode is `extractive|local`; status is `answered|abstained`; citations is Evidence[]; warnings is string[]; trace is `[{step,detail,duration_ms}]`. Persist all fields.

`InvestigationSummary`: `{id,incident_id,question,strategy,mode,status,answer_preview,created_at,duration_ms}`. `answer_preview` is the first 220 characters of the saved answer. Summaries omit claims, citations, trace, and warnings; reopening fetches the full investigation.

`Note`: `{id,incident_id,body,evidence_ids:string[],created_at}`.

`IncidentBrief`: `{schema_version:2,generated_at,incident,coverage,investigations,notes,hypotheses,sources,limitations}`. `incident` is IncidentSummary; `coverage` is `{investigations:{included,total},notes:{included,total},hypotheses:{included,total}}`; investigations are full Investigation records, notes are Note records, hypotheses are current Hypothesis records, sources are deduplicated Evidence records, and limitations are strings. Includes at most the latest 20 investigations, 50 notes and 50 current hypotheses, with explicit omission counts. All records and references are scoped to the requested incident. Manually referenced untrusted sources retain `trusted:false`.

`Evaluation`: `{id,strategy,passed,total,metrics,cases,created_at,duration_ms}`.
metrics is `{retrieval_recall,citation_validity,abstention_accuracy,injection_resistance}`, each 0..1. cases is `[{id,name,category,passed,detail,duration_ms}]`.

## Routes

- GET `/health` -> `{status:"ok",version:"1.0.0",storage:"sqlite",mode:"local-only"}`.
- GET `/config` -> `{generation_modes:["extractive"],local_model:{available,name,reason},limits:{question_chars:1000,note_chars:4000}}`. Add `local` to modes only when usable.
- GET `/incidents` -> IncidentSummary[].
- GET `/incidents/{id}` -> IncidentDetail.
- POST `/investigations`, body `{incident_id,question,strategy:"focused",mode:"extractive"}` -> Investigation, 201. Input lengths bounded; unavailable local mode returns 503, never silently pretends model inference occurred.
- GET `/investigations?incident_id=...` -> Investigation[] newest first, max 100.
- GET `/investigations/page?limit=20&offset=0&q=...&incident_id=...&status=...&mode=...` -> `{items:InvestigationSummary[],total,limit,offset}`. Every filter is optional; defaults are limit 20 and offset 0. Limit is 1..100; offset is a nonnegative signed 64-bit integer. `q` is stripped, maximum 200 characters after stripping, and matches a case-insensitive literal substring of the question only (Unicode case folding; `%`, `_`, backslashes, and quotes are literal). Status is `answered|abstained`; mode is `extractive|local`. Filters combine with AND. Unknown incidents return 404, invalid inputs 422, and an offset past the last result returns an empty items array with the matching total. SQLite filters, counts, and projects the page from one read snapshot; order is created_at descending, then insertion order descending for ties.
- GET `/investigations/{id}` -> Investigation.
- GET `/investigations/{id}/export?format=markdown|json` -> downloadable file.
- GET `/incidents/{id}/notes` -> Note[].
- POST `/incidents/{id}/notes`, body `{body,evidence_ids:[]}` -> Note, 201.
- GET `/incidents/{id}/brief?format=markdown|json` -> downloadable incident handoff, default Markdown. JSON follows IncidentBrief. Markdown contains incident context, coverage and omissions, saved questions/observations with run IDs/times/modes, claims and exact quotes, notes/references, analyst hypotheses with current revision numbers, sources, and limitations. This read-only route neither invokes a model nor saves a new record. It does not synthesize a root cause. User content is escaped in Markdown; JSON preserves content as data. Unknown incidents return 404; unsupported formats return 422.
- POST `/evaluations`, body `{strategy:"focused"}` -> Evaluation, 201. Fully local, deterministic fixtures; never invokes a model. A score is not a model benchmark.
- GET `/evaluations` -> Evaluation[] newest first, max 20.

## Evaluation fixture contract

`data/evaluations.json` is an array of cases. Each has `{id,name,category,incident_id,question,expected_evidence_ids:string[],expect_abstain:boolean}`. category is `retrieval|abstention|injection|isolation`. Backend may add direct validator cases (unknown source, changed quote, wrong incident). Retrieval recall uses fraction of expected IDs found in returned citations; explain aggregation.

## Analyst hypotheses

`HypothesisInput`: `{statement,status,rationale,next_check,supporting_evidence_ids,challenging_evidence_ids}`; all fields required. Statement is nonblank and at most 500 characters; rationale and next_check may be empty, at most 4000 and 1000 characters. Status is `open|supported|ruled_out` and always means an analyst judgment, not model verification. Reference arrays each hold at most 30 unique source IDs belonging to the incident; a source cannot appear on both sides. Untrusted source references are allowed for manual reasoning and retain their trust labels. Hypotheses are never retrieval context.

`Hypothesis` adds `{id,incident_id,revision,created_at,updated_at}`. Revision starts at 1; edits append an immutable full revision. List responses are `{items:Hypothesis[],total}`; latest 100 records/revisions are returned with total counts. Current records sort by updated_at descending then insertion order descending; revision history sorts by revision descending.

- GET `/incidents/{id}/hypotheses` -> current hypotheses.
- POST `/incidents/{id}/hypotheses`, body HypothesisInput -> Hypothesis, 201.
- PUT `/incidents/{id}/hypotheses/{hypothesis_id}`, body HypothesisInput plus `expected_revision` (integer 1..2^63-1) -> new Hypothesis revision. HTTP 409 if the stored revision changed; the caller must explicitly reload and reconcile. No last-write-wins.
- GET `/incidents/{id}/hypotheses/{hypothesis_id}/revisions` -> immutable revision history.

Unknown incident/hypothesis returns 404; out-of-incident or duplicate/overlapping references and invalid input return 422. A same-ID hypothesis in another incident is not exposed.

## Retrieval inspection

POST `/retrieval/inspect`, body `{incident_id,question}` -> `{incident_id,question,query_tokens,coverage_threshold,max_coverage,admitted,limit,candidates}`. Question follows the investigation length/nonblank limits. It compares the built-in BM25 and focused policies using their actual scorer, with no generation, remote request, or saved investigation.

Each candidate contains `{evidence_id,trusted,matched_terms,coverage,bm25_score,context_boost,kind_boost,focused_score,bm25_rank,focused_rank,exclusion_reason}`. Candidates are ordered by evidence timestamp then ID. Ranks are 1-based for eligible positive-overlap sources; the first `limit` (5) form each policy's context. Later ranks are inspectable but outside context. Ties use evidence ID. Scores are lexical relevance signals, not probabilities.

Admission requires maximum trusted-source query-token coverage of 0.4; each returned source only needs positive overlap after that global gate passes. Reasons are `untrusted|empty_query|below_coverage|no_overlap|null`. Untrusted candidates have zero scores/coverage, empty matched_terms, neutral multipliers, and null ranks; their text does not influence scoring statistics. Inspectable untrusted metadata remains in the incident response. Unknown incident returns 404; invalid input 422.

## Frontend development

Vite port 5173 proxies `/api` to `http://127.0.0.1:8100`; release FastAPI serves built frontend at `/`, with API 404s kept as API errors. Relative URLs only.
Frontend must not import the dataset or substitute mocks for a failed API.
