# EH-01 Base and Upstream Dependencies

## Selected base

The milestone branch is intentionally isolated from and based on `origin/main` commit `047da24ec0ac3e2ebe6972d89f26abed37acd0d5` (the user selected `origin/main` after being informed of the source gap). `feature/error-handling-audit` is cleanly created from that base; no earlier feature branch was merged or cherry-picked.

## Independent testability

The EH-01 work present in `origin/main` is independently testable. Its one data-processing CLI is covered by a standalone `unittest` suite, and the static web form can be run without any service. The main repository has no root package manifest, frontend test/lint/build command, backend app/test config, or CI test command. The repository's Python snippet needs pandas, which must be installed separately as shown in `REPRODUCTION.md`.

The full milestone is **not independently testable as a cross-stack backend/async-frontend milestone** on this base. This is a source-content limitation, not an implementation or test failure.

## Exact upstream dependencies absent from main

These are observed on branches but deliberately not imported into this milestone:

- `origin/feature/backend-foundation` (also ancestor of `origin/feature/auth-api`) adds `services/api/app/main.py`, FastAPI setup, and `services/api/pyproject.toml`.
- `origin/feature/auth-api` adds `services/api/app/{auth.py,database.py,models.py,seed.py}`, `services/api/app/routes/{authentication.py,suppliers.py,users.py}`, API tests, and `uis/backoffice/suppliers/supplier-directory.js` plus its UI. Those routes and frontend calls do not exist in `origin/main` and have not been modified or tested by EH-01.
- `origin/feature/incidents-analysis` adds `services/api/app/api/routes/{incidents.py,incident_results.py}`, `scripts/analyze.py`, its tests, and `uis/backoffice/dashboard.js` with async incident-analysis/export fetches. None of these files exist in `origin/main`; they have not been modified or tested by EH-01.
- `origin/feature/centralized-incident-manager` contains a separate UI/API evolution, also absent from main. It was not merged or tested as part of this branch.

## Blocked checklist scope

EH-B01..EH-B04 and EH-V06..EH-V07 are marked **BLOCKED** in `CHECKLIST.md` because the named milestone requires route auditing/status/security/external-integration tests, while no backend/routes are available in the selected base. EH-V01/V04 and portions of EH-F01/F02/F05/F06/F07 are **NOT_APPLICABLE** only for the static frontend actually on main (no fetch or async data). They do not assert that asynchronous feature-branch UIs were verified. See the checklist for item-level reasons.
