# Building Bullet-Proof Applications — evidencia académica

**Fuente normativa:** [README.es.md del proyecto](https://github.com/4GeeksAcademy/ai-engineering-syllabus/blob/main/content/projects/ai-eng-building-bullet-proof-applications/README.es.md).

## Conteo y alcance del checklist

El README contiene **25 checkboxes de nivel superior y 3 checkboxes anidados** para happy/edge/failure: 28 criterios atómicos en total. No deben confundirse con las “28 tareas” del portal; no contamos con una exportación del portal para mapearlas individualmente. La tabla enumera las 28 casillas explícitas del README exactamente una vez, incluyendo API-042 y FE-019 como extras.

**Resultado: 28 PASS, 0 NO APLICA y 0 FAIL** en los 28 criterios atómicos del README. Los criterios 12 y 13 (tests de utilidades TS de auth y happy/failure por función) son PASS: el cierre añade utilidades de autenticación reales integradas en el backoffice. No hay un requisito Swagger `/docs` en este README.

| # | Casilla atómica del README | Estado | Evidencia concreta |
|---:|---|---|---|
| 1 | Crear `TESTING.md` con ejecución, cobertura y casos/razones | PASS | `TESTING.md`, matrices y reproducción |
| 2 | Antes de tests, listar happy/edge/failure por endpoint | PASS | Plan previo registrado en `TESTING.md` e historia de cambios |
| 3 | Crear `tests/` en raíz FastAPI | PASS | `services/api/tests/` |
| 4 | Módulo de pruebas para cada endpoint auth | PASS | `services/api/tests/test_auth.py`; endpoints inventariados en `TESTING.md` |
| 5 | Por cada endpoint, incluir happy/edge/failure (checkbox padre) | PASS | Los tres subchecks siguientes se cumplen para los endpoints reales |
| 6 | Happy path por endpoint (subcheck) | PASS | Registro, login y `/auth/me` exitosos en `test_auth.py` |
| 7 | Edge por endpoint (subcheck) | PASS | Password 0/8/128/129; email duplicado normalizado; JWT sin `exp` y frontera expirada |
| 8 | Failure por endpoint (subcheck) | PASS | Credenciales inválidas; JWT malformado, alterado y expirado; usuario inactivo/eliminado |
| 9 | `uv run pytest` pasa desde raíz FastAPI | PASS | `services/api`: 30 passed, 0 failed |
| 10 | Cobertura auth ≥70% | PASS | 91% combinado: `app/auth.py` 89%, `app/routes/authentication.py` 97% |
| 11 | Condicional: configurar Jest para el proyecto TypeScript | PASS | `uis/backoffice/suppliers/jest.config.cjs`, `package.json`, `tsconfig.json` |
| 12 | Tests de funciones utilitarias TS relacionadas con auth | PASS | `src/auth-session.test.ts`: validación inputs, exp advisory, expiración y sesión `/auth/me` |
| 13 | Por cada función TS de auth, happy path y failure | PASS | `validateLoginInput`, `getTokenExpiration`, `isTokenExpired`, `createAuthSession`: happy/edge/failure, reloj/fetch controlados |
| 14 | Jest pasa con `--coverage` | PASS | `npm test`: 2 suites, 11 tests; 97.11% statements, 91.86% branches, 94.73% functions, 98.82% lines |
| 15 | IA identifica casos límite omitidos | PASS | `TESTING.md`, sección «Bugs y hallazgos de casos límite» |
| 16 | IA genera boilerplate y cada test se revisa/entiende | PASS | Casos contrastados con comportamiento real; decisiones en `TESTING.md` |
| 17 | Bug revelado por tests se corrige y documenta | PASS | Compatibilidad límite bcrypt y JWT sin `exp`, con regresiones en `TESTING.md` |
| 18 | Extra API: ≥2 grupos y ≥60% de cobertura | PASS | Users 87%, suppliers 96%; comandos separados documentados |
| 19 | Extra FE: ≥3 utilidades con happy + failure | PASS | Cuatro utilidades reales en `supplier-utils.ts` y Jest |
| 20 | Extra: `TESTING.md` documenta suites adicionales | PASS | Matrices API-042/FE-019 y reproducción independiente |
| 21 | Evaluación: `TESTING.md` documenta plan, ejecución y cobertura | PASS | `TESTING.md` y resultados medidos |
| 22 | Evaluación: pytest pasa | PASS | `uv run pytest -q`: 30 passed |
| 23 | Evaluación: happy/edge/failure por endpoint auth | PASS | Filas 5–8 y matriz en `TESTING.md` |
| 24 | Evaluación: auth coverage ≥70% | PASS | 91% combinado |
| 25 | Evaluación: aserciones de lógica de negocio, no framework/serialización | PASS | Reglas, autorización, hashing, claims y estado aislado |
| 26 | Evaluación: si hay utilidades TS, Jest pasa | PASS | Dos suites, 11 tests, coverage reportada |
| 27 | Evaluación: flujo IA evidente | PASS | Casos y bugs hallados por revisión asistida descritos en `TESTING.md` |
| 28 | Evaluación: nombres, estructura y comentarios claros | PASS | Tests descriptivos y estructura consistente |

> Los extras API-042 y FE-019 se incluyen en el mismo conteo porque son checkboxes explícitos del README; el ticket requerido en esta tarea no se confunde con tareas del portal.

## Evidencia de tickets adicionales y verificación runtime

| Área | Resultado ejecutado |
|---|---|
| AUTH-088 frontend | `auth-session.ts` con gate UI, login OAuth2, verificación `/auth/me`, Bearer en API y sesión en memoria; Jest 11/11, 97.11% statements, 91.86% branches, 94.73% functions y 98.82% lines. |
| API-042 usuarios/perfiles (`app/routes/users.py`) | **87%**, por encima de 60%; `uv run pytest --cov=app.routes.users --cov-report=term-missing` |
| API-042 proveedores (`app/routes/suppliers.py`) | **96%**, por encima de 60%; `uv run pytest --cov=app.routes.suppliers --cov-report=term-missing` |
| FE-019 | Cuatro utilidades reales: `labelFor`, `escapeHtml`, `currencyLabel`, `isRenewalSoon`; Jest comparte 2 suites / 11 tests con AUTH-088 frontend; cobertura global statements 97.11%, branches 91.86%, functions 94.73%, lines 98.82% |
| Browser smoke | Después de corregir el bundle y recargar, la página carga y muestra el gate de login; no hay errores uncaught de scripts propios. El navegador confirma los cuatro exports `NexovaAuth`, cinco exports `NexovaSupplierUtils`, login visible y app protegida oculta; se verificó el orden de los tres scripts. La advertencia Tailwind CDN es externa. No se ejecutó login con credenciales ni API real, por lo que el flujo autenticado queda verificado por Jest, no por smoke del navegador. |
| Orden y bundle | `index.html` carga `supplier-utils.js` y `auth-session.js` antes de `supplier-directory.js` (`defer`); `npm run build` crea ambos bundles clásicos desde sus fuentes TS. No se sustituyó producción por código de prueba. |

## Reproducción y resultados

Ejecutar desde directorios indicados y en secuencia para no compartir `.coverage` concurrentemente:

```sh
cd services/api
uv sync --extra dev
uv run pytest -q
uv run pytest --cov=app.auth --cov=app.routes.authentication --cov-report=term-missing
uv run pytest --cov=app.routes.users --cov-report=term-missing
uv run pytest --cov=app.routes.suppliers --cov-report=term-missing
cd ../../uis/backoffice/suppliers
npm ci
npm test
npm run build
cd ../../..
git diff --check
```

Resultados ejecutados en el cierre FINAL-02: API 30 passed; cobertura auth 91%, users 87%, suppliers 96%; Jest 11/11 en 2 suites, incluyendo siete tests de auth; cobertura combinada statements 97.11%, branches 91.86%, functions 94.73%, lines 98.82%; `npm run build` compila y genera ambos bundles; smoke de UI muestra formulario login sin errores uncaught; `git diff --check` sin errores. API mostró una advertencia externa de deprecación Starlette/httpx. `npm ci` informó 7 vulnerabilidades de severidad baja en el árbol npm; no se ejecutó `npm audit fix` por ser ajeno al cierre y potencialmente modificar dependencias.

### Casos límite y bugs reales

La revisión con asistencia IA destacó límite de bcrypt, `exp` ausente, expiración exacta, rollback de perfil, escape HTML, monedas inválidas, fechas imposibles y horizonte inclusivo de 60 días. Se corrigieron dos bugs de API: hashes nuevos usan `bcrypt_sha256` preservando verificación de hashes bcrypt anteriores; tokens sin `exp` se rechazan. La verificación en navegador encontró que el bundle TypeScript sobrescribía el `exports` global en vez de publicar `window.NexovaAuth`; se envolvió en scope local y se regeneró. La recarga posterior confirmó los globals sin error de scripts propios.
