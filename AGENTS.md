# AGENTS.md — Nexova Engineering Protocol

## Mission and sources
Operate inside the existing Nexova Solutions monorepo. Source of truth for this milestone: `BRIEFING.md`, copied from 4Geeks Academy's `nexova-BRIEFING.es.md` (Valencia, Spain + Miami, Florida). `company-choice.md` records the student's personal project vision; older `CONTEXT.md` versions are historical and do not override the official syllabus briefing. Do not invent business details or silently mix scenario editions.

## Mandatory start of EVERY session
Read in order: (1) `BRIEFING.md`, (2) `memory-bank/projectbrief.md`, (3) `memory-bank/techContext.md`, (4) `memory-bank/progress.md`, (5) relevant folder README(s), and (6) applicable `.agents/rules/` and `.agents/skills/`. Confirm current branch, worktree changes and intended scope before editing.

## Mandatory pre-commit workflow (execute IN ORDER)
1. **Scope** — restate requested change, acceptance criteria, business alignment and files permitted; inspect existing implementation first.
2. **Inspect** — read affected README, review git diff/status, verify changes do not duplicate an existing path or alter protected files.
3. **Validate** — run relevant project commands only if actually available; test changed behavior or documentation against acceptance criteria. Run `.agents/skills/milestone-audit/SKILL.md` for this milestone. Record pass/fail honestly.
4. **Update memory** — update `memory-bank/progress.md` and, if architectural/business decisions changed, the relevant memory files. Distinguish facts, assumptions, and planned work.
5. **Review diff & secrets** — check `git diff --check`, the final diff and staged file list; ensure no credentials, private client information, accidental binaries or unrelated edits.
6. **Commit & report** — only after checks pass, create an intentional commit in the feature branch and report SHA, validation evidence and remaining risks; push and open a PR to `main` when required. Do not auto-merge.

## Protected paths & actions requiring explicit developer confirmation
- `BRIEFING.md`, `CONTEXT.md`, `CONTEXT.es.md`, `company-choice.md`: business authority and historical context.
- `README.md`, `README.es.md` at root and any folder README that defines architecture.
- `uis/`, `services/`, `data/`, `agents/`, `skills/`, `mcps/`, `infra/`, `workflows/`, `packages/`, `shared/` application/product assets for this documentation-only milestone.
- `.github/`, CI, deployment config, lockfiles, secrets/env files, access settings.
- Deleting, overwriting or force-pushing branches; merging any PR; changing the designated business geography or scope.
Read protected files freely; do not change without explicit authorization. `BRIEFING.md` is created as an approved deliverable in this milestone; subsequent edits still require confirmation.

## Correct locations
Public site: `uis/website/`; internal UI: `uis/backoffice/`; backend: `services/`. Development-agent configuration: `.agents/rules/` and `.agents/skills/`; these are not the same as product directories `agents/` and `skills/`. Read existing README first. No parallel app trees.

## Safe autonomy
If requirements conflict with `BRIEFING.md`, a risky action affects a protected path, tests fail or information is missing, stop the risky action and report concrete options. Never fabricate tests, shell output, completed features, citations or business data.
