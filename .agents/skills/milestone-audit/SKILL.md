---
name: milestone-audit
description: Check the AI-driven engineering milestone documentation, rule scope and safe Git handoff without changing application code.
---

# Skill: Milestone Audit

## Single objective
Assess whether Nexova's documentation-only AI-driven engineering milestone meets the five official acceptance criteria, and output an evidence-backed PASS/FAIL report. This skill does not modify files or open/merge a PR.

## When to use
Before the last commit or PR submission of this milestone; also after any changes to `BRIEFING.md`, `AGENTS.md`, `memory-bank/`, or `.agents/`.

## Inputs (required)
- Repository root and target branch (`feature/agent-memory-bank`).
- `BRIEFING.md`, `company-choice.md` and `README.md`.
- `memory-bank/projectbrief.md`, `memory-bank/techContext.md`, `memory-bank/progress.md`.
- `AGENTS.md`, one or more `.agents/rules/*.md`, and this `SKILL.md`.

## Procedure (read-only)
1. Read root `BRIEFING.md`; confirm it is sourced from the official syllabus `nexova-BRIEFING.es.md` and describes Nexova in Valencia (Spain) + Miami (Florida), including key departments and customer-support challenges. Treat older `CONTEXT.md` as historical only. Flag mismatched scenario facts anywhere within milestone deliverables.
2. Read all three memory files: `projectbrief.md` must explain the business and problem; `techContext.md` must explain technical decisions, limitations and exact app paths; `progress.md` must state verified current progress and next steps.
3. Check `AGENTS.md` names all three memory files for session startup, contains >=4 **ordered** pre-commit steps and identifies protected paths requiring developer confirmation.
4. Verify at least one rule at `.agents/rules/` states scope explicitly (always active, path-specific or on request), and at least one skill under `.agents/skills/<name>/SKILL.md` has one objective, documented inputs, procedure, and testable acceptance.
5. Confirm the documented app locations: `uis/website/`, `uis/backoffice/`, `services/`; avoid creating a parallel application tree. Distinguish dev-agent configuration `.agents/` from product `agents/` and `skills/`.
6. Review `git status --short`, `git diff --check`, `git diff main...HEAD --name-only`, and (if present) `git diff --cached --check`. Check there are no application changes, leaked credentials or out-of-scope files. If Git CLI is unavailable, use GitHub's compare API and clearly mark local-only checks NOT RUN.

## Output contract
Produce a compact report with fields: `criterion`, `status` (PASS/FAIL/NOT VERIFIED), `evidence path`, `observation`. Include `branch`, `HEAD`, `main HEAD`, exact commands/API checks, unresolved risks and overall status. Never invent command output. A missing input or unexecuted validation is NOT VERIFIED, not PASS.

## Acceptance criteria (all mandatory)
- [ ] Memory bank includes meaningful business **and** technical context aligned with the chosen briefing.
- [ ] Root `AGENTS.md` has >=4 explicit ordered pre-commit steps, startup reading and protected-file rules.
- [ ] At least one `.agents/rules/*.md` documents when it applies.
- [ ] At least one `SKILL.md` has exactly one objective, required inputs and verifiable criteria.
- [ ] Documentation places future website, backoffice and APIs at canonical locations with no new parallel application directory.

**Passing condition:** all five are PASS, source geography is internally consistent, and no out-of-scope application code changed. Even a PASS does not prove executable applications work.
