# Building Bullet-Proof Applications — evidencia académica

**Fuente normativa:** [README.es.md del proyecto](https://github.com/4GeeksAcademy/ai-engineering-syllabus/blob/main/content/projects/ai-eng-building-bullet-proof-applications/README.es.md).

## Conteo y alcance del checklist

El README contiene **28 casillas Markdown explícitas**: 24 casillas fuera de la lista TypeScript, 1 casilla Jest de cobertura y 3 subcasillas de happy/edge/failure (incluye además 3 extras dentro de su sección). La tabla enumera las 28 casillas evaluables por el milestone principal y la sección extra se evalúa por separado para no contarla dos veces. No deben confundirse con las “28 tareas” mostradas por el portal: no contamos con una exportación del portal para mapearlas individualmente. La tabla siguiente corresponde literalmente a esas 28 casillas fuente; API-042 y FE-019 también se informan como extras solicitados.

**Resultado: 28 PASS y 0 NO APLICA.** Se implementó un flujo frontend de autenticación TypeScript real y sus utilidades se cubren en Jest; no aplica el estado condicional porque ya hay funciones TS de auth. No hay un requisito Swagger `/docs` en este README. Las filas 21–28 corresponden a las ocho casillas de evaluación de la fuente y se muestran separadas aunque algunas corroboran evidencia ya citada.

| # | Casilla atómica del README | Estado | Evidencia concreta |
|---:|---|---|---|
| 1 | Crear `TESTING.md` con ejecución, cobertura de suites y casos/razones | PASS | `TESTING.md`, matrices y reproducción |
| 2 | Antes de tests, listar happy/edge/failure por endpoint | PASS | Plan anotado antes de test code en `TESTING.md`; precedencia confirmada en historial Git |
| 3 | Crear `tests/` en raíz FastAPI | PASS | `services/api/tests/` |
| 4 | Módulo de pruebas para cada endpoint auth | PASS | `services/api/tests/test_auth.py`, rutas reales inventariadas en `TESTING.md` |
| 5 | Por endpoint implementar happy, edge y failure como mínimo (casilla padre) | PASS | Desglosado para los tres endpoints en criterios 6–8 |
| 6 | Happy path por endpoint | PASS | Registro, login y `/auth/me` exitosos en `test_auth.py` |
| 7 | Edge por endpoint | PASS | Password 0/8/128/129; duplicado email normalizado; JWT sin `exp` y frontera de expiración |
| 8 | Failure por endpoint | PASS | Credenciales inválidas, duplicado, token malformado/tampered/expirado, usuario inactivo/eliminado |
| 9 | `uv run pytest` pasa desde raíz FastAPI | PASS | `services/api`: 30 passed, 0 failed |
| 10 | Cobertura auth ≥70% | PASS | 91% combinado: `app/auth.py` 89%, `app/routes/authentication.py` 97% |
| 11 | Condicional: configurar Jest en raíz del proyecto TS | PASS | `uis/backoffice/suppliers/jest.config.cjs`, `package.json`, `tsconfig.json` |
| 12 | Tests de funciones utilitarias TS relacionadas con auth | PASS | `uis/backoffice/suppliers/src/auth-session.test.ts`: validación de inputs, extracción advisory de `exp`, expiración, sesión in-memory y verificación `/auth/me`. |
| 13 | Por cada función TS de auth, happy y failure | PASS | `validateLoginInput`, `getTokenExpiration`, `isTokenExpired`, `createAuthSession`: tests happy/edge/failure, con reloj y fetch controlados. |
| 14 | Jest pasa con `--coverage` | PASS | `cd uis/backoffice/suppliers && npm test`: 2 suites, 11 tests; coverage global statements 97.11%, branches 91.86%, functions 94.73%, lines 98.82% |
| 15 | Usar IA para identificar casos límite omitidos | PASS | `TESTING.md`, sección «Bugs y hallazgos de casos límite» |
| 16 | IA para boilerplate y revisión/entendimiento de cada test | PASS | Tests contrastados con comportamiento real; decisiones y matrices en `TESTING.md` |
| 17 | Corregir y documentar bug revelado por tests | PASS | Bugs bcrypt límite 72 bytes y JWT sin `exp`, con regresiones documentadas en `TESTING.md` y pruebas |
| 18 | Extra API: ≥2 grupos, coverage ≥60% | PASS | Users 87%, suppliers 96%; comandos independientes en `TESTING.md` |
| 19 | Extra FE: ≥3 utilidades, happy + failure por función | PASS | Cuatro funciones reales y tests en `supplier-utils.ts` / `supplier-utils.test.ts` |
| 20 | Extra: `TESTING.md` con resultados e instrucciones de suites adicionales | PASS | Matrices API-042/FE-019 y reproducción independiente en `TESTING.md` |
| 21 | Evaluación: `TESTING.md` plan, ejecución, cobertura | PASS | `TESTING.md` y resultados de cierre medidos |
| 22 | Evaluación: pytest pasa sin errores | PASS | `uv run pytest -q`: 30 passed |
| 23 | Evaluación: happy/edge/failure para cada endpoint auth | PASS | Evidencia en criterios 5–8 y matriz de `TESTING.md` |
| 24 | Evaluación: auth coverage ≥70% | PASS | 91% combinado |
| 25 | Evaluación: aserciones de lógica, no serialización/framework | PASS | Reglas, permisos, hashing, claims y estado persistido; no internals de FastAPI |
| 26 | Evaluación: si hay utilidades TypeScript, Jest existe y pasa | PASS | TS de auth y proveedores está cubierto; 11 tests pasan con coverage |
| 27 | Evaluación: flujo IA evidente en `TESTING.md` | PASS | Casos límite y bugs descubiertos descritos en `TESTING.md` |
| 28 | Evaluación: nombres/estructura claros y comentarios breves | PASS | Tests con nombres descriptivos y estructura consistente |

> Nota de conteo: los puntos 12–13 son condicionales y se cumplen porque ahora existe el módulo real `auth-session.ts`, utilizado por el backoffice y probado con happy/edge/failure. Los extras API-042 y FE-019 permanecen identificados por separado.

## Evidencia de tickets adicionales y verificación runtime

| Área | Resultado ejecutado |
|---|---|
| AUTH-088 frontend | `auth-session.ts` con gate UI, login OAuth2, verificación `/auth/me`, Bearer en API y sesión en memoria; Jest 11/11, 97.11% statements, 91.86% branches, 94.73% functions y 98.82% lines. |
| API-042 usuarios/perfiles (`app/routes/users.py`) | **87%**, por encima de 60%; `uv run pytest --cov=app.routes.users --cov-report=term-missing` |
| API-042 proveedores (`app/routes/suppliers.py`) | **96%**, por encima de 60%; `uv run pytest --cov=app.routes.suppliers --cov-report=term-missing` |
| FE-019 | Cuatro utilidades reales: `labelFor`, `escapeHtml`, `currencyLabel`, `isRenewalSoon`; Jest comparte 2 suites / 11 tests con AUTH-088 frontend; cobertura global statements 97.11%, branches 91.86%, functions 94.73%, lines 98.82% |
| Browser smoke | Con la nueva frontera de login, la página carga en navegador y muestra el formulario sin errores uncaught de scripts. El test Jest de `createAuthSession` comprueba login real por contrato, `GET /auth/me`, fallos y encabezados. La lista de proveedores ahora requiere autorización API; el servidor sigue siendo autoridad para permisos. |
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

La revisión con asistencia IA destacó límite de bcrypt, `exp` ausente, expiración exacta, rollback de perfil, escape HTML, monedas inválidas, fechas imposibles y horizonte inclusivo de 60 días. Se corrigieron dos bugs de API: hashes nuevos usan `bcrypt_sha256` preservando verificación de hashes bcrypt anteriores; tokens sin `exp` se rechazan. La verificación real en navegador descubrió y corrigió también el bundle que no exponía globalmente la utilidad TypeScript.
