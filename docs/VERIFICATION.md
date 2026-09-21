# Verification observations

Date: 2026-09-21 UTC. Scope: the local synthetic-data portfolio application. These observations do not establish production readiness, security certification, WCAG conformance, or general model accuracy.

## Local acceptance

Backend and delivery gate observed on integrated source `6b39e636f6e7ecf1461b577639ed0998b835b5c5`:

- **76 Python tests passed**: retrieval, incident scoping, validation, provider failure/metadata, HTTP guards, exports, notes, storage/restart and evaluations.
- **Six delivery tests passed**: consistent WAL backup, missing/overwrite refusal, deterministic packaging and exclusion of untracked local data, dirty-source rejection, symlink refusal and executable launchers.
- Ruff, frontend ESLint, TypeScript and production build passed.
- Gitleaks scanned 23 commits / approximately 851 KB of history and reported no leaks. The tracked-text guard also passed. This is text/history detection, not proof that every possible secret is absent. Documentation screenshots contain the synthetic UI and were visually inspected.

After the chart-axis correction in `a757949`, **eight Chromium end-to-end tests passed**:

1. Real-API investigation, citation inspection, evidence-linked notes, persistence, JSON export and history reopening.
2. Unsupported-question abstention and evaluation case results.
3. Scenario selection, cross-incident reference rejection and hostile-origin rejection.
4. API failure display and recovery, with no hidden fixture fallback.
5. Axe serious/critical checks and overflow at 1440, 1190 and 390 pixels, plus mobile navigation.
6. Delayed incident responses cannot overwrite the current selection.
7. Delayed investigations cannot appear in another incident.
8. Rendered chart coordinates agree with actual timestamp intervals and value axes.

The frontend agent also inspected the evaluation view at desktop/mobile widths. Both async races and the chart error were reproduced by failing browser tests before correction. Screenshots are in `docs/images/`.

## Evaluation and local inference

Both BM25 and focused policies passed **23/23 deterministic cases**: 19 authored fixtures plus four direct citation-validator attacks. The fixtures informed development. Passing them is not an independent held-out evaluation or an LLM benchmark; see [method and denominators](EVALUATION.md).

An actual loopback API invocation used the already-installed `llama3.1:8b-instruct-q4_K_M` model under cloud-disabled Ollama. It returned two claims and two exact-quote-checked citations in **20.624 seconds**, with no rejected claims. This is one functional smoke observation, not a latency benchmark. The model received no remediation tools. No model was downloaded and no hosted model was called.

## Packaging, recovery and review

The bundle built from `6b39e636f6e7ecf1461b577639ed0998b835b5c5` passed SHA-256/manifest validation, extraction to an isolated project-local folder, locked dependency installation and live health/interface/incident checks. Its checksum was `3313385aea8bc3a1fc43a96bd9d635cd2310f70316b5ab4ad92c289a31245937`. Subsequent source bundles are built and boot-tested by the same CI command; this historical observation is not rewritten to describe later bytes.

A consistent backup of the running demo retained both stored records, matched their original payloads and passed SQLite integrity_check. Six dedicated tooling tests cover backup refusal and WAL behavior.

The [independent adversarial review](reviews/2026-09-21-backend-delivery.md) requested two repairs, then approved the affected recheck. Review was performed by an independent coding agent, not a human approver. No blocking findings remain in that scope.

## CI and cost boundary

[GitHub Actions](https://github.com/ripleyforge/proofline/actions/workflows/ci.yml) runs the checked-in gate and then builds and boots the portable bundle on Linux. Main requires its successful check and a pull request; force pushes and deletion are disabled, including for administrators. This record reports local observations; GitHub's run history is authoritative for remote CI status and delivered commits.

The organization had an existing $0 Actions budget with stop-spend enabled, verified before execution. No budget was raised, paid runner selected, cache/artifact storage configured, cloud infrastructure provisioned, or paid API used. Repository and branch-protection observations are in `operations/`.

Known limits: single local user; synthetic evidence; lexical heuristics; quote integrity rather than entailment; an Ollama inactivity timeout rather than a strict total deadline. Two upstream Starlette/AnyIO deprecation warnings occurred in tests without failures. The development-only origin setting is disabled in the packaged default.
