# Decisions

- 2026-09-21: Build a local evidence-centered incident investigation product for applied AI and solutions engineering portfolio work. Keep all scenarios synthetic and the repository private.
- Use React/TypeScript, FastAPI and SQLite; isolate retrieval, generation, validation and persistence through small real substitution seams. See [architecture](docs/ARCHITECTURE.md).
- Make deterministic extracts the complete default experience; optional installed local model only, with cloud disabled and no silent fallback.
- Treat quoted source integrity and semantic correctness as different claims. Keep source isolation and unsupported-question behavior visible and testable.
- Deliver through a reviewed GitHub PR, CI checks and a verified local bundle. Do not provision cloud infrastructure. Existing $0 Actions stop-spend budget remains unchanged.
- Keep the repository's Workbench classification advisory with custom checked-in CI. Managed-CI parity/provider release adapters are not configured; no provider deployment is claimed or attempted. Direct application/browser/package checks are the project's acceptance gates.
- Use the canonical Ripley Forge Ember palette and locally hosted Archivo/IBM Plex Mono fonts. The owner's requested Proofline variation uses square corners and restrained smoked-glass navigation, overriding the brand kit's default radius and no-glass rules for this project only. Evidence, charts and forms stay opaque; ember identifies actions and selection, with text/icons carrying status meaning. Reduced-transparency mode removes the glass treatment.
