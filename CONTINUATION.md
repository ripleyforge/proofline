# Proofline continuation

Complete v1 implementation and local acceptance are verified. Read README.md to run the app and docs/DEMO.md for the five-minute walkthrough. The private source is `ripleyforge/proofline`; GitHub PR/main checks identify the delivered revision. Main requires the application/browser CI check and a PR; no force pushes/deletion.

The project has a React/TypeScript workspace, FastAPI service, SQLite persistence, three synthetic scenarios, deterministic retrieval/evaluations, optional installed local Ollama generation and verified local packaging/backup. Local results:76 backend tests, 6 delivery tests, 8 browser workflows. Independent backend/delivery review resolved both findings. See docs/VERIFICATION.md for scope and limits.

No paid/cloud service was provisioned. The existing organization $0 Actions stop-spend budget remains unchanged. Optional installed model: llama3.1:8b-instruct-q4_K_M on 127.0.0.1:11435 with OLLAMA_NO_CLOUD=1. Runtime state/model observations/screenshots are project-local and ignored except reviewed synthetic documentation images.

No known blocking implementation issue. Future hosting or real-data integration is a new scope requiring identity, authorization, data controls and explicit spend approval. Do not represent this as a production AWS deployment or the fixture score as model accuracy.
