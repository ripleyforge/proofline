# Running and recovering Proofline

## Start / stop / health

Use `bash scripts/setup.sh` once, then `python3 scripts/serve.py`. The process binds only to 127.0.0.1:8100. Ctrl+C stops it. It is not installed as a startup service. `python3 scripts/smoke.py` performs read-only health/config/incident checks. Request logs and UI errors provide a local failure signal; no telemetry leaves the machine.

The optional model listener is a separate process on 127.0.0.1:11435, started with `bash scripts/start-local-model.sh`. Stop it with Ctrl+C. A missing model disables local AI; evidence extracts remain available. No model downloads or API purchases happen automatically.

## Configuration

Environment variables, with no implicit dotenv parsing:

| Variable | Default | Purpose |
|---|---|---|
| PROOFLINE_DB_PATH | .local/proofline.sqlite3 | Local persistent SQLite file |
| PROOFLINE_DATA_DIR | repository data/ | Synthetic corpus and evaluation definitions |
| PROOFLINE_FRONTEND_DIST | frontend/dist | Built interface |
| PROOFLINE_OLLAMA_URL | http://127.0.0.1:11435 | Loopback-only local provider |
| PROOFLINE_OLLAMA_MODEL | empty | Explicitly enable installed local model |
| PROOFLINE_DEV_ORIGIN | unset | One explicit loopback dev UI origin; `serve.py --dev` sets http://127.0.0.1:5173 |

Keep defaults for the demo. No production credentials are needed or read.

## History and incident handoffs

History uses `/api/investigations/page` to load 20 compact summaries at a time. Search matches literal question text, and incident, status, and generation-mode filters combine. Reopening a result fetches the saved full investigation. The original full-record list remains available and capped at 100; paging reaches older runs without that cap. SQLite performs filtering, counting, ordering, and summary projection in one read snapshot. A global listing index is added on startup without rewriting existing records. Schema 2 additionally stores hypothesis heads and immutable revisions. Literal substring search still scans matching question text; it is intended for this local workbench, not an indexed full-text search service.

Download `/api/incidents/<id>/brief?format=markdown` or `format=json` for an incident handoff. It includes the latest 20 saved investigations, 50 notes and 50 current hypotheses from a consistent read snapshot, plus included/total counts and explicit omissions. The export does not call a model or modify the database. It collects saved work without synthesizing a root cause. Notes and hypotheses remain user-authored observations; manually referenced untrusted sources remain labeled untrusted. Run citations preserve saved source snapshots, while note/hypothesis-only references use the currently loaded corpus. The combined source list favors the newest saved snapshot unless a manually referenced source is currently untrusted; full run citations remain available in the JSON.

Handoffs are bounded selections, not backups. Use database backup/restore below to retain all work, and paged history to reopen omitted older investigations. Changing the corpus can affect note references; sources or records outside the current incident are excluded and disclosed in limitations rather than silently crossing incident boundaries.

## Backup and restore

Run `python3 scripts/backup.py` while the app is running or stopped. It uses SQLite's backup API and runs an integrity check; copying a live WAL database by hand can lose data.

The backup command defaults to `.local/proofline.sqlite3`; it does not read `PROOFLINE_DB_PATH`. If you started the app with a custom database, pass that same path explicitly: `python3 scripts/backup.py --database <your-database-path>`.

To restore, stop Proofline and close every connection to its database. Make a backup of the current database first. Restore into a **new filename** to avoid mixing old WAL sidecars with restored data:

```sh
cp .local/backups/<chosen-backup>.sqlite3 .local/restored.sqlite3
PROOFLINE_DB_PATH=.local/restored.sqlite3 python3 scripts/serve.py
```

Confirm prior notes, run history and hypothesis revisions before treating restoration as complete. Retain the old file until satisfied. Backups and exports are local user data; choose retention deliberately. The demo does not erase them automatically.

## Local delivery and rollback

The CI pipeline tests and builds a portable source-and-interface archive but uploads nothing. Run `python3 scripts/package.py` on a clean committed checkout to create the same archive locally. Its SHA-256 sidecar checks transport integrity; the internal manifest identifies each source/built file and the revision. It is not a cryptographic signature or a security certification.

Extract the archive into a new folder. Run `uv sync --project backend --frozen --no-dev`, then `python3 scripts/serve.py`; the frontend is prebuilt, so Node is not needed just to run that bundle. Dependency installation still needs network/cache access. Packaging selects tracked files (except `.github/`) and regular built-interface files; default runtime databases and model files are outside that selection. Review `MANIFEST.json` before sharing: ignore rules do not protect a sensitive file that someone force-tracks or places in the build directory.

For rollback, stop the app, retain/backup data, and run the previous verified bundle in its own folder with an explicit database path. Schema 2 adds hypothesis tables and preserves all schema-1 records. Back up a schema-1 database before its first schema-2 startup. An older application refuses a schema-2 database; to run an older bundle, use a separate restored pre-upgrade backup. Keep the schema-2 file to preserve newly created hypotheses and other later work. Do not downgrade or overwrite it in place.

## GitHub / cost operations

Repository owner: Chase Ripley / Ripley Forge. Source visibility is read back from GitHub; it does not change the application's local-only boundary. Health is the PR/main verification check. Feature branches land through a reviewed pull request. CI uses pinned GitHub actions with read-only token permissions and does not receive cloud secrets.

No AWS service, hosted model, runner upgrade, Actions cache or uploaded CI artifact is provisioned. An existing organization Actions budget of $0 with stop-spend enabled was checked before CI. Budget exhaustion must block work, not trigger a purchase or a plan change. Disable the repository workflow if future automation must stop. See append-only observations in `docs/operations/`.

## Hypothesis editing

Hypothesis edits append revisions; there is no delete action. The list shows the latest 100 hypotheses and history the latest 100 revisions, with total counts. A conflicting edit from another tab returns 409 and leaves the draft visible; use the explicit reload control to reconcile before saving. Latest hypothesis states appear in handoffs, but complete revision history lives in the SQLite backup. The interface labels all statuses as analyst assessments. Source links and trust labels do not make the reasoning true.

Workspace selection and the last saved result resume within the same browser tab. Only IDs are stored for result restoration; API failure never produces a cached substitute. Questions, notes and hypothesis drafts are also tab-scoped. Successful hypothesis saves and explicit discard clear that draft; switching views or incidents does not. If browser storage is blocked, the notice explains which state cannot survive navigation or reload.
