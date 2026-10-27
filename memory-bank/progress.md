# Progress — Nexova AI Engineering Milestone

## Estado actualizado al 2026-10-26
- Empresa elegida: Nexova Solutions, escenario Valencia (España) + Miami (Florida), según briefing del syllabus y corrección del profesor.
- Repositorio de estudiante: `FranckDomingues/Company-Nexova-FranckDomingues`.
- Rama de entrega: `feature/agent-memory-bank` (no fusionar a `main` antes de la revisión).
- Fuente de briefing verificada: `4GeeksAcademy/ai-engineering-syllabus/content/contexts/00-general-contexts/nexova-BRIEFING.es.md`.
- Este hito prepara contexto y reglas de ingeniería con IA; ninguna aplicación/RAG/ticketing nueva forma parte de la entrega.

## Checklist de aceptación
- [x] Sustituir `BRIEFING.md` por el briefing oficial del syllabus (Valencia + Miami) y alinear todos los documentos de este hito.
- [x] `projectbrief.md` y `techContext.md` con negocio y técnica.
- [x] `AGENTS.md` con lecturas iniciales, >=4 pasos previos a commit y rutas protegidas.
- [x] Regla en `.agents/rules/` con scope explícito.
- [x] Skill en `.agents/skills/` con objetivo, entradas, salidas y aceptación verificable.
- [x] Verificar árbol remoto, existencia y consistencia documental mediante GitHub API y los cinco criterios de la skill (revisión documental). Git CLI local ejecutado en Codespaces: git diff --check origin/main...HEAD PASS; siete archivos verificados; worktree limpio. Pruebas de aplicaciones: NO APLICAN a este hito documental.
- [x] Verificar diff remoto de la rama contra main: siete archivos añadidos, cero archivos de aplicación modificados (GitHub compare). PR #1 creada y abierta hacia main.
- [ ] Profesor: nueva revisión pendiente tras rechazo por geografía incorrecta (sin merge adelantado).

## Próximas decisiones
- La evaluación del profesor resolvió la discrepancia: la versión del syllabus (Valencia + Miami) es obligatoria en este hito. Tras publicar la corrección, solicitar reevaluación de la PR #1.
- Después de aprobarse este hito, definir un solo incremento del asistente de soporte; no iniciar implementación aquí.

## Mantenimiento del banco de memoria
Actualizar este archivo al final de cada entrega relevante con hechos verificados, pruebas ejecutadas, pendientes y decisiones; jamás registrar resultados no comprobados.

## Historial de corrección
- 2026-10-26: el profesor rechazó la entrega por usar Chile/Argentina y exigió el archivo oficial `nexova-BRIEFING.es.md` del syllabus (Valencia/Miami). Se ajustaron los siete entregables documentales del hito; no se altera el contexto histórico ni el código de aplicación.
- QA de la corrección: pendiente de verificación completa del diff y sincronización Git local; no reutilizar el PASS previo como prueba de estos cambios.
