# Architecture and decisions

```mermaid
flowchart LR
  UI[React investigation workspace] --> API[FastAPI application]
  API --> Service[Investigation service]
  Service --> Retrieval[BM25 / focused retriever]
  Retrieval --> Corpus[Validated synthetic evidence]
  Service --> Generator[Extractive or local Ollama generator]
  Generator --> Validator[Source and quote validator]
  Validator --> Store[(SQLite runs and notes)]
  API --> Eval[Deterministic evaluation runner]
  API --> Export[Markdown / JSON evidence export]
```

Domain independent of HTTP. Retrieval, generation and persistence have small injected interfaces because those are actual substitution and test seams. Validation happens after generation. Invalid claims are dropped and disclosed; no supported claims means abstention. Evidence is scoped before ranking.

BM25 is a transparent lexical baseline, suitable for a compact technical corpus. Focused retrieval adds documented incident-context priors, not vector embeddings. Keeping a baseline exposes whether extra policy improves the test set. SQLite fits one local user; no database subscription. React and TypeScript provide a typed interactive UI; Python makes evaluation/retrieval straightforward to inspect. No orchestration framework is needed.

Default extractive engine is not an LLM. Local generation uses installed Ollama on loopback with cloud features disabled. No model gets shell, network, cloud, or remediation tools. Citation checks do not establish entailment. UI/exports disclose those boundaries.

## History and handoff reads

The workspace does not fetch full history during startup. History requests one page of compact summaries; SQLite applies question/incident/status/mode filters, counts matches, and projects the displayed fields before returning them. Opening a run fetches its full immutable result. This reduces initial requests and avoids sending citation bodies for runs the user has not opened. Literal substring search is adequate for this local corpus; no search service is provisioned. A seeded 100-run comparison returned 571,291 bytes through the legacy full-history route and 10,605 bytes for the first 20 summary records. This measures response bodies for different page sizes, not latency or general scalability.

Incident handoff export reads a consistent SQLite snapshot containing the latest 20 investigations and 50 notes for that incident, plus counts of all available records. It includes deduplicated referenced sources and discloses omitted records. It makes no model request and does not synthesize a root cause. Existing per-run exports remain available.

Drafts are separate from saved records. Browser session storage retains question/note drafts by incident for the current tab. A successful note save clears that draft; changing incidents does not move text or source references into another incident.

## Operational boundaries

Loopback, synthetic data, single user, bounded inputs, no telemetry or secrets. No production availability or tenant-isolation claim. Cloud architecture is a documented future mapping only, with no infrastructure provisioned.

## Retrieval policy details

Tokenization lowercases alphanumerics and removes a fixed stopword set. Both policies require at least 40% of meaningful query tokens to occur in one trusted source before admitting answer context. This conservative lexical threshold reduces incidental-overlap answers; it can reject valid paraphrases and does not establish semantic relevance. At most five sources are returned. Focused ranking boosts incident service/tag matches by 15% and explicit evidence-kind hints by 25%; priors never admit a zero-overlap source. These choices were developed against the authored scenarios and must be re-evaluated on new data.

## Reference documentation

[Ollama local-only operation](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features), [Ollama structured output API](https://docs.ollama.com/api/generate), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), and [GitHub budget enforcement](https://docs.github.com/en/billing/concepts/budgets-and-alerts) informed provider boundaries. Local readbacks, not a free-tier assumption, established the configured model and existing zero-dollar budget.
