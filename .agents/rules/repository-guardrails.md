---
description: Guardrails for any code or documentation change in Nexova's monorepo
alwaysApply: true
---

# Nexova Repository Guardrails

**Scope:** always active for all files and all AI coding sessions within this repository. Explicit `alwaysApply: true`; agents that do not support rule frontmatter must read this manually through root `AGENTS.md`.

1. Load `BRIEFING.md` and the three files in `memory-bank/` before work; use the official syllabus scenario Valencia (Spain) + Miami (Florida), never mix facts from another Nexova edition.
2. Read target-folder README before choosing location; website in `uis/website/`, internal backoffice in `uis/backoffice/`, backend in `services/`. Do not invent `frontend/` or `backend/` trees.
3. Confine changes to the assigned acceptance criteria. This milestone is documentation and dev-agent configuration only, not implementation of chatbot/RAG/tickets/APIs.
4. For `BRIEFING.md`, `CONTEXT*.md`, `company-choice.md`, README conventions and production/application folders, request explicit permission before modifying, except initial creation of `BRIEFING.md` for this milestone.
5. No secrets, PII, client datasets, unsupported claims or untested success assertions in the public repo.
6. Follow the six ordered steps of `AGENTS.md` before commit, then PR toward `main`; do not merge without human approval.
