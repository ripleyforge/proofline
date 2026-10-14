# Delivery ownership and zero-cost boundary

Owner: Chase Ripley / Ripley Forge. Environment: local portfolio demo.
Repository: `ripleyforge/proofline`. Resource owner is the same operator; source publication requires the owner's action-scoped authorization.
Health: GitHub PR checks and `/api/health`; failures visible in Actions/UI.
Rollback: revert a delivered commit via PR; for local app stop process, restore database backup, then run prior locally built release.
Disable: stop local process; disable this repository's Actions workflows.
No automatic cloud provisioning or public publishing is configured.

GitHub observations before initial repository creation (2026-09-21 UTC): organization has an Actions budget of $0 with `prevent_further_usage=true` and included standard Linux minutes. Existing September Actions usage reported net amount 0. CI uses short standard Linux job, no cache or artifact upload. Existing spend stop remains unchanged. If included minutes unavailable, CI stops rather than purchasing capacity.

Operator authorization in task 01a0c24c-f805-7123-bf3d-8cbd940fae87 covers creating this private repository, incremental commits and full project delivery tonight, subject to no costs. Initial action: create private `ripleyforge/proofline` once; reconcile by exact repository name before retrying. Authority expires at task completion. This record does not authorize other repositories or paid resources.

Local data belongs in ignored `.local/`. Synthetic seed files tracked; user notes, databases, model caches and release bundles are not.

Source publication keeps the same local-only operating boundary. The owner's current publication task authorizes reviewed PR delivery and the exact `ripleyforge/proofline` visibility change after publication review and candidate gates. The action is recorded with the exact delivered revision and before/after provider readbacks; historical observations below remain historical. Reverting visibility cannot recall copies already obtained while public. The disable path is to restore private visibility and stop further distribution; verify owner permissions and the current visibility endpoint before the action. This authorizes no hosting, billing change, or other repository mutation.


The follow-up improvement task authorizes implementation, incremental pushes,
reviewed PR delivery and local packaging of analyst reasoning tools, retrieval
inspection, a synthetic conflict scenario and workspace continuity. The same
private repository and no-spend boundary apply. On 2026-09-24 UTC, live GitHub
readback still showed the Actions product budget at $0 with
`prevent_further_usage=true`, repository private, and the required application
and browser check on protected main. No billing or branch policy was changed.
Workbench's managed checks report legacy/no `workbench.json` and unavailable
managed CI/GitHub adapters; this repository's declared delivery gate is its
checked-in local suite, required GitHub check and one independent review.
