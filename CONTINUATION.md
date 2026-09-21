# Proofline continuation

Complete v1 implementation and local acceptance are verified. Read README.md to run the app and docs/DEMO.md for the five-minute walkthrough. The private source is `ripleyforge/proofline`; GitHub PR/main checks identify the delivered revision. Main requires the application/browser CI check and a PR; no force pushes/deletion.

The project has a React/TypeScript workspace, FastAPI service, SQLite persistence, three synthetic scenarios, deterministic retrieval/evaluations, optional installed local Ollama generation and verified local packaging/backup. The improvement pass adds searchable server-paged history, bounded incident handoff exports, tab-scoped incident drafts, and keyboard/mobile refinements. Verification now covers 98 backend tests, 6 delivery tests, and 21 browser workflows. See docs/VERIFICATION.md for observed runs and scope; independent reviews are under docs/reviews/.

No paid/cloud service was provisioned. The existing organization $0 Actions stop-spend budget remains unchanged. Optional installed model: llama3.1:8b-instruct-q4_K_M on 127.0.0.1:11435 with OLLAMA_NO_CLOUD=1. Runtime state/model observations/screenshots are project-local and ignored except reviewed synthetic documentation images.

No known blocking implementation issue. Future hosting or real-data integration is a new scope requiring identity, authorization, data controls and explicit spend approval. Do not represent this as a production AWS deployment or the fixture score as model accuracy.
