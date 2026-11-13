# Building Bullet-Proof Applications — plan y reproducción

## Baseline y alcance

- Rama del milestone: `feature/bullet-proof-applications`, basada en `feature/auth-api` (`ce80160830f1dc44ca5fc93bca933824b73e50a6`), con los prerequisitos de proveedor en su historia. `main` no se modifica ni se fusionan PRs previos.
- Proyecto API FastAPI: `services/api`; TinyDB aislada con `tmp_path`, variables de entorno de prueba y dependency overrides. No se accede a bases ni servicios de producción.
- Autenticación contiene exactamente `POST /users`, `POST /auth/login` y `GET /auth/me`. Dos grupos extra API-042: usuarios/perfiles (`app/routes/users.py`) y proveedores (`app/routes/suppliers.py`).
- El frontend real es HTML/JavaScript estático, no Next.js. La interfaz de proveedores tenía cuatro utilidades reales inline. Se extrajeron sin cambiar el propósito de comportamiento a TypeScript y se consumen en producción desde `supplier-directory.js`. El bundle clásico de navegador se genera desde esa fuente y se versiona.

## Plan de pruebas escrito antes del código de prueba

El inventario y los casos happy/edge/failure fueron registrados antes de implementar tests. Las decisiones se basaron en rutas reales y reglas existentes; no se inventaron endpoints:

| Endpoint | Decisión/entradas/dependencias | Happy | Borde | Fallo |
|---|---|---|---|---|
| `POST /users` | Normaliza email, impide duplicados, valida password 8–128 caracteres, crea cuenta activa de rol mínimo y perfil enlazado; TinyDB y hashing. | `test_register_creates_normalized_user_and_single_profile`: normalización, hash y perfil. | `test_registration_password_length_boundaries_and_empty_password`: longitudes 0/8/128/129. | `test_unique_normalized_email_and_role_validation`: email duplicado con diferente capitalización y rol inválido; `test_registration_rolls_back_user_when_profile_insert_fails`: rollback si falla la escritura del perfil. |
| `POST /auth/login` | Formulario OAuth2 `username/password`, búsqueda normalizada, verificación de hash y estado activo; JWT dependiente de secreto/config de expiración. | Login correcto dentro de `test_password_login_and_auth_me_exclude_hashes`. | Campos de formulario vacíos/ausentes (validación); password presente pero whitespace en `test_login_empty_unknown_and_inactive_account_failures`. | Password incorrecta, usuario inexistente e inactivo: mismo test. |
| `GET /auth/me` | Valida firma JWT, claim exp, subject, usuario existente y activo; devuelve identidad/perfil. | Token válido en `test_password_login_and_auth_me_exclude_hashes`. | Expiración exacta y `exp` ausente en `test_tokens_missing_exp_claim_and_expiration_boundary_are_rejected`. | Token ausente/malformado, firma alterada, expirado, usuario inactivo/eliminado en tests JWT correspondientes. |

JWTs de borde se firman con claims fijos; no se duerme ni depende de esperas de reloj. No se prueban internals HTTP o serialización; se verifican reglas de negocio, estado persistido aislado, autorización y claims.

### Matriz adicional API-042

| Grupo real | Happy | Edge | Fallo |
|---|---|---|---|
| `app/routes/users.py` usuarios/perfiles | Registro, perfil enlazado, lectura/actualización propia y operaciones administrativas: `test_profile_me_and_user_ownership_and_admin_operations`, `test_user_delete_own_and_linked_profile_and_user_crud`. | Contraseñas 0/8/128/129, updates parciales y normalización de perfil. | Duplicados, roles inválidos, 401/403 por identidad/rol, registros inexistentes y fallo de persistencia/rollback. |
| `app/routes/suppliers.py` proveedores | Crear/listar/detalle/eliminar y cambios tasa/estado: `services/api/tests/test_suppliers.py`. | Filtros vacíos, filtros por país/categoría, cantidades positivas y seed idempotente. | Payload/enums inválidos, ID inexistente, 401/403, JWT expirado o malformado. |

### Matriz FE-019

| Utilidad existente y consumida en la página | Camino feliz | Fallo/borde |
|---|---|---|
| `labelFor` | Etiqueta de categoría conocida | Valor desconocido/vacío |
| `escapeHtml` | Escapa comillas, markup y ampersand | nullish/valores arbitrarios |
| `currencyLabel` | Formatea moneda y tarifa | tarifa/currency/argumento inválido |
| `isRenewalSoon` | Hoy y límite inclusivo 60 días | Fechas pasadas, inválidas, inexistentes y `Date` no válido |

Pruebas en `uis/backoffice/suppliers/src/supplier-utils.test.ts`; Jest y ts-jest viven en ese proyecto frontend. El bundle `dist/supplier-utils.js` no es código de prueba; es la salida reproducible de `npm run build` y la carga real de la página.

## Reproducción completa

Desde la raíz del repositorio, ejecutar secuencialmente:

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
```

Las coberturas Python deben correr una después de otra porque usan el mismo archivo `.coverage`. Desde la raíz, `git diff --check` valida los cambios antes del commit. No se requiere probar Swagger `/docs` según el README académico actual.

## Resultados de cierre (ejecutados)

| Suite/criterio | Comando | Resultado |
|---|---|---|
| FastAPI completo | `cd services/api && uv run pytest -q` | 30 passed, 0 failed; 1 warning externo deprecación `httpx` en Starlette TestClient |
| AUTH-088 | `uv run pytest --cov=app.auth --cov=app.routes.authentication --cov-report=term-missing` | 91% combinado; `app/auth.py` 89%, `app/routes/authentication.py` 97% |
| API-042 usuarios/perfiles | `uv run pytest --cov=app.routes.users --cov-report=term-missing` | 87% |
| API-042 proveedores | `uv run pytest --cov=app.routes.suppliers --cov-report=term-missing` | 96% |
| FE-019 | `npm test` (`jest --coverage --runInBand`) | 1 suite, 4 tests passed; statements 96.42%, branches 91.3%, functions 100%, lines 95.45% |
| Bundle | `npm run build` | TSC + generación del bundle browser ejecutadas correctamente |
| Browser smoke test | Abrir `uis/backoffice/index.html` | Antes: error uncaught porque el UMD no asignaba `window.NexovaSupplierUtils` en script clásico. Corregido build. Después: no pageError; global expone categorías, labelFor, escapeHtml, currencyLabel, isRenewalSoon; 15 filas, labels localizados y tarifas renderizadas. El fixture no tiene renovaciones próximas; el comportamiento de resaltado fecha se comprueba determinísticamente en Jest. |

## Bugs y hallazgos de casos límite (revisión asistida por IA)

- bcrypt solo procesa 72 bytes en modo tradicional aunque la validación API acepte passwords de hasta 128 caracteres. Hashes nuevos usan `bcrypt_sha256`; verificación sigue admitiendo hashes bcrypt anteriores. Las longitudes 128 y 129 quedan cubiertas.
- JWTs firmados sin `exp` se aceptaban; ahora se rechazan porque los tokens generados por la API siempre expiran. Pruebas comprueban falta de claim, firma, expiración y límite.
- La prueba manual en navegador descubrió una regresión de runtime: el bundle TypeScript UMD no publicaba el objeto global en un navegador clásico. El build crea ahora un bundle de navegador desde el mismo `.ts`, y el smoke test comprueba los cinco exports que el script de la página consume.
- Otros bordes probados: rollback si falla el alta de perfil, caracteres HTML peligrosos, currency desconocida, fechas ISO imposibles y horizonte inclusivo de 60 días.

Los tests tienen nombres descriptivos y verifican decisiones de negocio; los datos de prueba y secretos son locales. No se versionan `.coverage`, cobertura frontend, `node_modules`, bases generadas ni credenciales.
