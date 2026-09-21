# Portfolio and interview guide

## A defensible project description

**Proofline — incident investigation and AI evaluation workbench**

A local React/TypeScript and Python application that helps an engineer examine operational evidence, ask scoped questions, inspect source-linked results, and retain an auditable incident handoff. Optional local model inference is separated from deterministic evidence extraction and evaluated with explicit limitations.

Candidate resume bullet, to use after reviewing and understanding the project:

> Built an incident investigation workbench with React, FastAPI and SQLite, combining scoped retrieval, source-linked local AI responses, adversarial evaluation cases and a tested CI delivery pipeline.

Do not describe this as deployed AWS infrastructure, production customer usage, measured business savings, or proof that generated answers are factually correct. Actual test counts and local inference measurements are recorded separately in the verification report. Do not turn a fixture pass rate into a real-world accuracy claim.

## Why it fits the target roles

For an associate solutions architect or delivery consultant, demonstrate how a customer's on-call workflow became a bounded design; discuss cost, failure behavior, data sensitivity, and the future AWS mapping. For applied AI engineering, demonstrate retrieval policy comparison, structured output, source/quote validation, evaluation design, API/UI integration, and failure handling. For graduate software engineering, discuss interfaces, persistence, meaningful tests, debugging and tradeoffs.

## Explain these decisions without reading the code

- Why SQLite and a synchronous API suit one local user, and which requirements would force a change.
- Why evidence is scoped before retrieval and why a label on a malicious note is not general prompt-injection detection.
- Why a correct source identifier and exact quote do not prove semantic entailment.
- Why a deterministic baseline is useful, and why evaluation scores must disclose their denominator and fixture scope.
- How a local provider failure differs from a model answer with no valid claims.
- How the pipeline tests the packaged application, not merely a development build.
- How a real multi-user system would authorize evidence, isolate tenants and control spend.

## Development provenance

This project was developed with AI coding agents for implementation, testing and review under a user-directed portfolio brief. Its architecture, code, commit history and verification are available for inspection. Before using it as interview evidence, run the demo, read the main flow and independently make a small change you can explain. Describe your own role accurately; do not claim personal manual authorship of every component.

## Suggested extension to own personally

Add one new synthetic failure scenario with conflicting evidence, write its evaluation cases first, then examine how both retrieval strategies behave. Explain any failure and implement the smallest justified improvement. This is a useful, concrete way to build independent familiarity without adding cloud infrastructure.
