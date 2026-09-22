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

## Investigation handoff improvement pass — 2026-09-21

The implementation candidate is `17c1239c4494a9c218cc9581e0edab3516b664f1`. Subsequent documentation commits record these observations without changing the reviewed application behavior.

- **98 backend tests** and **six delivery tests** passed on the integrated improvement implementation. The 22 added backend tests cover page boundaries, literal Unicode search, filters, summary projection, legacy compatibility, index migration, handoff coverage, incident isolation, note-only sources, trust labels and Markdown escaping. Ruff, ESLint, TypeScript and the production build passed.
- **19 browser tests passed together** after correcting mobile history filter overflow. Two additional regression variants reproduced a note-save/navigation race before its repair, then passed with the existing draft-persistence and full investigation workflow tests on `17c1239`. The browser suite now contains **21 tests**. GitHub CI runs that complete suite on each final candidate.
- Added browser coverage includes drafts across incident switches/reloads, storage failure, incident-scoped references, preserving edits during a save, delayed history/reopen responses, history paging/search, handoff downloads, keyboard focus containment and restoration, and mobile history controls.
- Gitleaks scanned 37 commits / approximately 993 KB of history through `17c1239` and reported no leaks. The tracked-text guard passed; documentation images were visually inspected separately. Neither check proves that every possible secret is absent.

With 100 seeded synthetic investigations, the legacy full-history response measured **571,291 bytes**, while the first page of 20 summary records measured **10,605 bytes** and retained a total count of 100. This is a response-body comparison for one fixture set, not a latency benchmark or a claim of indexed full-text search. The workspace no longer loads saved history on startup.

Desktop workspace and history screenshots were refreshed. Browser checks exercised 390-pixel history controls with no document overflow, plus the existing desktop/mobile serious and critical axe checks. These observations are not a WCAG conformance claim.

Before restarting the local demo with the additive SQLite index, a consistent project-local database backup passed integrity checking. The handoff endpoints perform no inference or writes and disclose included/total counts when the latest 20 runs or 50 notes omit older records. Browser drafts remain in the current tab's session storage, with an explicit in-memory fallback if storage is unavailable.

The [independent improvement review](reviews/2026-09-21-improvements.md) covers backend behavior and the integrated interface. The reviewed note race and its affected-path recheck are recorded there. Optional model code is unchanged; the earlier local inference observation remains historical evidence, and no additional model or cloud invocation was needed for this pass.


## Ember interface update — 2026-09-22 UTC

Runtime candidate `be37836d2920b4b0a8f8e2aa11a0958a6a90ffc8` applies the canonical Ripley Forge colors and licensed local fonts, with the owner-requested square corners and restrained glass navigation. Charts, evidence, forms and results remain opaque. Reduced-transparency mode removes blur and translucency. No application API or backend behavior changed.

The existing 21 browser workflows passed on the theme implementation. Broader rendered inspection of workspace, completed result, evidence drawer, history, evaluation and mobile views found a pre-existing keyboard-access gap in the horizontally scrollable evaluation table. A new browser regression failed before the fix and passed afterward. Following the final control-width refinement, all three affected desktop/mobile accessibility, evaluation-scroll and history-control checks passed. The suite now contains 22 browser tests; required CI executes the complete suite.

TypeScript/build, ESLint and diff checks passed. The rendered checks observed both fonts loaded locally and no external browser requests. Documentation screenshots were refreshed from synthetic preview data and visually inspected. The font binaries are byte-for-byte copies from the canonical brand kit, with their OFL licenses included; binary files are not covered by the tracked-text credential scanner.

An independent coding agent approved `be37836` after exact-diff, desktop/mobile visual and focused rendered review, including the reduced-transparency fallback and keyboard table scrolling. No actionable findings remained in this UI scope. This is agent review and bounded automated accessibility evidence, not human approval or a WCAG conformance claim.
