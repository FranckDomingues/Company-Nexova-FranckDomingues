## AUTH-03 — Recuperación y cambio de contraseña

> ⚠️ **Dependencia: este PR no se puede fusionar por sí solo.** `main` aún no contiene los hitos anteriores. La rama parte de `feature/auth-frontend` (#11), así que el diff contra `main` también incluye #4 → #5 (AUTH-01) → #9 → #10 → #11. **Orden de merge: #4 → #5 → #9 → #10 → #11 → este PR.** Para revisar solo AUTH-03: `git diff feature/auth-frontend...feature/password-reset`.

### Estado

**Criterios oficiales: 22/24 PASS, 2 BLOCKED, 0 FAIL. Extras: 3/3.** Los dos bloqueados (DO-B4 y EVAL-01, envío de un email *real*) dependen de una API key de Resend, que no está disponible en este entorno. Todo el camino del email está implementado y verificado:

- El adaptador real habló con un servidor compatible con Resend durante el E2E.
- Contra `api.resend.com`, una key inválida devolvió `401`.

Falta observar una entrega real. Instrucciones para desbloquearlo: `docs/evidence/AUTH-03-E2E-REPORT.md`.

### Backend (`services/api`)

- `POST /auth/forgot-password`: siempre responde `200` con el mismo cuerpo. Genera un token aleatorio de 256 bits y en TinyDB solo guarda su SHA-256. La caducidad es configurable entre 15 y 60 min. El email se envía en segundo plano mediante Resend.
- `POST /auth/reset-password`: valida que el token exista, no se haya usado, no haya caducado y sea posterior al último cambio de contraseña. El cambio de hash y el consumo del token ocurren bajo un mismo lock, con rollback si algo falla. Devuelve `400` si el token es inválido, ha caducado o ya se usó.
- `POST /auth/change-password`: requiere sesión (Bearer de AUTH-01). Devuelve `401` sin token y `400` si la contraseña actual es incorrecta.
- `app/mailer.py`: interfaz `EmailSender` y `ResendEmailSender`, que usa solo la librería estándar (sin dependencias nuevas). `app/email_templates.py`: HTML responsive con alternativa en texto plano.
- Variables documentadas en `.env.example` y en el README. `.env` está en el `.gitignore` del API y en un nuevo `.gitignore` raíz.

### Frontend (`uis/backoffice`)

- `/forgot-password`: confirmación genérica y formulario desactivado tras el envío.
- `/reset-password`: lee el token de la URL y lo quita de la barra de direcciones. Comprueba que las contraseñas coincidan. Si todo va bien, redirige a `/login` con un mensaje de éxito. Si el token no vale, muestra un error claro con un enlace a `/forgot-password`.
- `/account/change-password`: ruta protegida. Valida la confirmación antes de llamar a la API y muestra el `400` junto al campo de la contraseña actual.
- `/login`: enlace visible "¿Olvidaste tu contraseña?". El perfil enlaza a "Cambiar contraseña".

### Extras

- **Plantilla HTML:** verificada en un viewport de 390 px.
- **Rate limiting:** 3 solicitudes/h por email, sin aviso y aplicado también a emails no registrados; 20/h por IP, con `429`.
- **Auditoría:** cada evento guarda timestamp, IP, user agent y resultado. Nunca guarda contraseñas, tokens ni emails.

### Verificación

| Gate | Resultado |
|---|---|
| pytest backend | 92 passed (32 nuevos) |
| Jest frontend | 142 passed, 0 failed (21 nuevos) |
| Integración live (API real) | 14 passed |
| E2E Chrome + API + PostgreSQL (proveedor de email simulado) | 56 passed, 0 failed (20 de AUTH-03) |
| Lint, typecheck, build, `git diff --check` | OK |
| Escaneo de secretos | limpio |
| Envío real con Resend | **BLOCKED** (falta `RESEND_API_KEY`) |

Evidencias:
- `docs/evidence/AUTH-03-CHECKLIST.md` (24 criterios)
- `docs/evidence/AUTH-03-TEST-REPORT.md`
- `docs/evidence/AUTH-03-SECURITY-REPORT.md`
- `docs/evidence/AUTH-03-E2E-REPORT.md`
- `docs/evidence/auth-03/` (capturas y resultados)

### Limitaciones conocidas

- El lock funciona dentro de un solo proceso. Con varios workers haría falta un bloqueo a nivel de base de datos.
- Los JWT de sesión ya emitidos no se revocan al cambiar la contraseña; caducan solos. Evitarlo cambiaría el comportamiento de AUTH-01.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
