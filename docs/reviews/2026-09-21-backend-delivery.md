# Independent backend and delivery review

One independent adversarial coding agent reviewed backend/delivery candidate `76f8f45810c36c3702bb197dedec40dc2617862d`. This was an agent review, not human approval or security certification. Scope: incident/citation isolation, local-provider admission, input handling, persistence/export and local packaging.

Initial verdict: request changes, one P2 and one P3.

| Finding | Repair | Evidence |
|---|---|---|
| Archive stripped the executable bit from the macOS launcher | Preserve executable intent as 0755; ordinary files 0644 | Failing-then-passing tooling regression; commit `8f31088bdbecee1ba08339c54f52daa84215a008` |
| Markdown apostrophes became literal escaped entities | Escape HTML delimiters without encoding quotes | Failing-then-passing export regression; commit `9d9e6acbc1e81a03fba337dce64ef7810eee29bb` |

Affected-path recheck verdict: approve, no open findings. The recheck also confirmed that the new explicit development-origin allowance defaults to disabled, admits only the configured validated loopback HTTP origin, and retains cross-site rejection. Seven affected backend checks and the launcher regression passed.

Accepted limitations: exact quote integrity does not establish semantic entailment; known untrusted-evidence labels are not automatic injection detection; HTTPX uses an inactivity timeout rather than a total wall-clock deadline. No remote model/cloud call was made during this review. Frontend review and live browser checks are recorded in the final verification report.
