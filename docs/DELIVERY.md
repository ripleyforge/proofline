# Delivery ownership and zero-cost boundary

Owner: Chase Ripley / Ripley Forge. Environment: local portfolio demo.
Repository: `ripleyforge/proofline`, private. Resource owner is the same operator.
Health: GitHub PR checks and `/api/health`; failures visible in Actions/UI.
Rollback: revert a delivered commit via PR; for local app stop process, restore database backup, then run prior locally built release.
Disable: stop local process; disable this repository's Actions workflows.
No automatic cloud provisioning or public publishing is configured.

GitHub observations before initial repository creation (2026-09-21 UTC): organization has an Actions budget of $0 with `prevent_further_usage=true` and included standard Linux minutes. Existing September Actions usage reported net amount 0. CI uses short standard Linux job, no cache or artifact upload. Existing spend stop remains unchanged. If included minutes unavailable, CI stops rather than purchasing capacity.

Operator authorization in task 01a0c24c-f805-7123-bf3d-8cbd940fae87 covers creating this private repository, incremental commits and full project delivery tonight, subject to no costs. Initial action: create private `ripleyforge/proofline` once; reconcile by exact repository name before retrying. Authority expires at task completion. This record does not authorize other repositories or paid resources.

Local data belongs in ignored `.local/`. Synthetic seed files tracked; user notes, databases, model caches and release bundles are not.
