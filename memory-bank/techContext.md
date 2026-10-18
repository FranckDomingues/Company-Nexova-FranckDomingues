# Tech Context — Nexova Monorepo

## Estado verificado
Monorepo de plantilla 4Geeks, con documentación de carpetas y algunos artefactos de ejemplo; no asumir una aplicación completa en funcionamiento ni tests globales disponibles. No hay runner de workspace en la raíz según el README de la plantilla. `company-choice.md` registra una visión, no implementación.

## Arquitectura de carpetas (obligatoria)
- `uis/website/`: sitio público, en la ruta web `/`.
- `uis/backoffice/`: aplicación interna separada, cuando se cree.
- `services/`: APIs y backend (la plantilla favorece un backend FastAPI centralizado cuando aplique).
- `data/`: datasets, procesamiento y evaluación.
- `agents/`, `skills/`, `mcps/`: código de producto para agentes e integraciones futuras.
- `.agents/rules/`, `.agents/skills/`: instrucciones para agentes de programación; **no** código de producto.
- `memory-bank/`: contexto persistente; `AGENTS.md`: contrato de colaboración.
No crear directorios paralelos `frontend/`, `backend/`, `app/` ni duplicar una ubicación existente.

## Decisiones técnicas vigentes
1. Preservar la estructura de la plantilla y leer los README correspondientes antes de modificar carpetas.
2. Este milestone produce documentos, configuración y una skill de validación documental; sin instalar dependencias ni cambiar la aplicación de muestra.
3. Para código futuro, elegir stack y contratos solo después de un requerimiento concreto; FastAPI es orientación de plantilla, no un servicio desplegado.
4. Commits solo en feature branch; revisión mediante PR, sin merge automático.
5. Seguridad: no incluir secretos, tokens, PII ni datos de clientes reales en prompts, logs, capturas o repositorio público.

## Discrepancia conocida de fuentes
El `CONTEXT.md` del repo `4GeeksAcademy/Project-FG-Company-Nexova` se refiere a Chile + Argentina; el briefing del syllabus general consultado el 2026-10-18 se refiere a España + Miami. Se conserva íntegro el primero en `BRIEFING.md`, porque concuerda con el monorepo y la elección previa del estudiante. Escalar al instructor si indica que prevalece la variante del syllabus.

## Validación disponible
La skill `.agents/skills/milestone-audit/SKILL.md` define comprobaciones manuales reproducibles usando búsqueda, existencia de archivos y Git. No afirmar que pruebas de software o CI han pasado sin ejecutarlas.
