# Threat model and boundaries

Proofline is for one local user and synthetic examples. It is not authenticated or designed for exposure to a LAN, reverse proxy, or the public internet.

| Input / asset | Risk | Boundary |
|---|---|---|
| Evidence text and generated content | Prompt injection, unsupported claims | No tools; incident-scoped retrieval; explicit untrusted evidence exclusion; source and exact-quote checks after generation |
| Free-form question and note | Stored script content, database injection | React text rendering; bounded schemas; parameterized SQLite |
| Browser writes | Cross-site request attacks | Loopback hosts and origin checks; same-origin API |
| Local model endpoint | Accidental paid request or data disclosure | Loopback-only endpoint; cloud model rejection; no proxies or redirects; timeout and output cap |
| Private repository / CI | Leaked credentials or billable execution | Synthetic fixtures; ignored runtime data; secret scans; read-only CI token; pinned actions; existing $0 stop-spend budget |
| SQLite / exported brief | Local sensitive information | No telemetry; local owner controls files; consistent backup; no notes or DB checked into Git |
| Browser session drafts | Unfinished text retained in the current tab | Incident-scoped keys; references checked against that incident; clear a note draft after successful save; no remote synchronization |

Quote integrity is weaker than semantic correctness. A model can cite a real quote and draw the wrong conclusion. Known untrusted-note labels are a controlled data-quality boundary, not universal injection detection. The assistant cannot remediate or mutate a real service. Review all generated prose.

Report a defect by opening a private repository issue with a minimal synthetic reproduction. Do not attach credentials, personal records, or real incident logs. Before public release, choose a private reporting channel and reassess this document. No security certification or compliance claim is made.
