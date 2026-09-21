# Deterministic fixture evaluation

`data/evaluations.json` contains 19 fully local cases. Every case is bound to one incident and names the trusted evidence that a source-grounded answer should cite. Empty expected evidence with `expect_abstain: true` means the fixture contains no supported answer for that incident.

| Category | Cases | Purpose |
|---|---:|---|
| Retrieval | 8 | Recover a narrow change, measurement, log, counterexample, or stated uncertainty. |
| Abstention | 4 | Reject questions whose subject vocabulary and facts are absent from the incident. |
| Injection | 3 | Exclude the known untrusted imported note, abstain on its unsupported command, and allow a grounded rebuttal from trusted evidence. |
| Isolation | 4 | Prevent distinctive facts from one incident from appearing in another incident's answer. |

## Expected scoring behavior

For a case with expected evidence, retrieval recall is the number of distinct expected IDs present in returned citations divided by the number of expected IDs. Aggregate retrieval recall is the arithmetic mean across cases with non-empty expected evidence; empty sets are excluded from that metric rather than treated as perfect retrieval.

Abstention accuracy compares the returned status with `expect_abstain` for each case. Citation validity requires every returned citation and verbatim quote to belong to the case's incident and to trusted evidence. Injection resistance requires injection cases to avoid citing `checkout-note-imported-untrusted-001` and to match the case's expected abstention or trusted-evidence set. The application reports arithmetic means and keeps individual case results visible. It additionally runs four direct validator attacks: unknown source, altered quote, wrong incident, and untrusted source. The displayed Boundary checks metric combines the three injection fixtures with these four direct attacks. Citation validity is the mean validity of returned claims; an empty claim population scores 0. Status accuracy compares answered/abstained status across all 19 authored fixtures.

## Fixture design and limits

Retrieval questions are narrow enough to have a defensible evidence set. Expected IDs identify the minimum sources needed for the asked fact; they are not hidden root-cause labels. Some evidence outside the expected set may be relevant context, so extra valid citations should not reduce recall.

Unknown questions deliberately use absent subject terms such as Kubernetes ephemeral storage, weather telemetry, tax jurisdiction, and GPU qualification. This reduces accidental lexical matches and makes abstention expectations reproducible. Isolation questions use distinctive facts from a different incident, so a result can expose cross-incident contamination without relying on vague questions.

The v1 retrieval score measures behavior on a small authored corpus. Lexical search can miss paraphrases, overweight repeated tokens, and rank a hypothesis above counterevidence; these cases do not establish semantic understanding. The one malicious note is pre-labeled with `trusted: false`. Passing injection cases therefore demonstrates enforcement of a known contamination label, not automatic detection of prompt injection or malicious text. The evaluation is synthetic and is not a model benchmark or a production-security claim.
