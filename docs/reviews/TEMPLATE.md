# Adversarial review — <date> — <scope>

<!--
This is the blank: copy it to docs/reviews/<YYYY-MM-DD>-<scope>.md and fill
it in. Do not edit TEMPLATE.md itself.

The stage (run it after any non-trivial change, BEFORE wrapup):

1. Spawn at least TWO independent reviewer agents — one security lens, one
   correctness lens. Independent means: they read the code fresh, with no
   access to the builder's reasoning, plan, or chat history.
2. Frame both as REFUTATION, not confirmation: "find what is wrong with the
   claim that this change is correct/safe", never "check that it works".
   A reviewer that reports nothing must say what it tried and failed to break.
3. Every finding needs evidence the builder can act on: a file:line, a
   failing input, or a reproducible command — "looks suspicious" is not a
   finding.
4. The builder answers every finding here: fixed (with the commit/test),
   or rejected (with the reason). No silent drops.
5. File this document in docs/reviews/ in the same commit as the fixes.
-->

**Change under review:** <one line: what was built/changed, and the commits or diff reviewed>
**Reviewers:** <e.g. 2 independent agents — security lens, correctness lens; fresh read>
**Claim being attacked:** proofline <claim, e.g. "the X change is correct, safe, and regression-tested">

## Verdict

<one paragraph: did the claim survive? Findings count by severity; what was
fixed; what risk remains accepted.>

## Findings and resolutions

| ID | Sev | Lens | Finding (evidence: file:line / repro) | Resolution (fix commit/test, or rejection reason) |
|----|-----|------|---------------------------------------|----------------------------------------------------|
| 1  | high/med/low | security/correctness | … | Fixed — … / Rejected — … |

## Attacked but survived

<What each reviewer explicitly tried to break and could not — the refutation
attempts that failed. An empty section means the review was too shallow.>

- …

## Follow-ups (out of scope here)

- <anything real but deliberately not fixed in this change; where it is tracked>
