# AGENTS.md — proofline (router)

**What:** New proofline project. · **Status:** active · **Stack:** unselected · **Remote:** not configured

## Routing table

| Task | Read | Avoid | Skills |
|---|---|---|---|
| Implementation change | relevant source and matching tests | generated outputs | test-driven-development |
| Project-record change | matching root record | unrelated implementation files | project-lifecycle |
| Pre-commit verification | project verification configuration | generated outputs | project-lifecycle |

## Commands

- Verify records: `git diff --check`
- Run/test: select a runtime before defining these commands.

## Layout

- Project records are at root; implementation layout is intentionally unset.

## Project invariants

- `workbench.json` remains the only declared project profile until a project decision selects the language and runtime.
