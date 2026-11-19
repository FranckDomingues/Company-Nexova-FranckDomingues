# AUTH-02 — Checklist (Conectando el Candado: Flujos de Autenticación en el Frontend)

- **Branch:** `feature/auth-frontend`
- **Base:** `feature/inventory-backoffice` (PR #10), which already contains AUTH-01 (`feature/auth-api`, PR #5). See *Dependency* below.
- **Official source:** [`sources/auth-02-README.es.md`](./sources/auth-02-README.es.md), syllabus commit `784ef4a9c280e3000bbe79f53c6a15dbe1a43372`.
- **Results:** recorded on 2026-11-18 against the commit that contains this file. Test details are in [`AUTH-02-TEST-REPORT.md`](./AUTH-02-TEST-REPORT.md). Routes are in [`AUTH-02-ROUTE-MATRIX.md`](./AUTH-02-ROUTE-MATRIX.md).

## Summary

| Block | Result |
|---|---|
| Official "Qué Debes Hacer" checklist (DO-01…10) | **10/10 PASS** |
| Official "Qué Vamos a Evaluar" criteria (EVAL-01…06) | **6/6 PASS** |
| **Official total** | **16/16 PASS** |

Two deviations from the assignment text are explained under *Platform mismatch* below. Neither one changes a result.

## How tests are labelled

- **Unit (simulated):** Jest + jsdom. They use the **real** `NexovaAuth` module, the real HTTP client and the real views. Only `fetch` is mocked, by a stateful fake of the FastAPI contracts (`tests/auth-fixtures.ts`).
- **Live (real):** `tests/live.integration.test.ts` runs against the real FastAPI app with real JWTs and no mocks. It runs inside the E2E harness.
- **E2E (real):** `npm run e2e:auth`. It uses headless Chrome, the real FastAPI app, a disposable PostgreSQL 16 container and a temporary TinyDB. Results are in [`auth-02/e2e-results.json`](./auth-02/e2e-results.json) and the screenshots are in [`auth-02/`](./auth-02/).

Paths are relative to `uis/backoffice/` unless stated otherwise.

## Official checklist — "Qué Debes Hacer" (10)

| ID | Official item | Implementation | Verification | Status |
|---|---|---|---|---|
| DO-01 | `/login`: email and password form. On success it stores the token in `localStorage` and redirects to the main authenticated view. On failure it shows a clear error. | `inventory/src/views/login.ts`; `suppliers/src/auth-session.ts` `login()` (`POST /auth/login` OAuth2 form, then `GET /auth/me`, then `store.set`). `/login` is a 302 alias to `/backoffice/login` (`inventory/serve.cjs`). | Unit T01, T02, validation and network-error cases; Live "wrong password"; E2E "wrong password → clear error…", "correct password → token stored → redirected" | PASS |
| DO-02 | `/register`: calls `POST /users` with the optional profile fields, then `POST /auth/login` with the same credentials, stores the token and redirects. Shows field-level validation errors. | `inventory/src/views/register.ts`; `auth-session.ts` `register()` and `validateRegistrationInput()`, which mirror `UserRegistration` (email, password 8–128, name ≤200, phone ≤50, address ≤500). `/register` alias. | Unit T03, T04a (client), T04b (409), T04c (422), plus the "created but login failed" case; Live register → login → localStorage, plus 409/422; E2E alias, client error, real 409, and full registration → main view | PASS |
| DO-03 | `/account/profile`: shows the email and the profile `name`/`phone`/`address` from `GET /auth/me`. Edits them with `PUT /profiles/me` and the token. | `inventory/src/views/profile.ts` (read: `session.verify({force:true})` → `GET /auth/me`); `inventory/src/lib/account.ts` (`PUT /profiles/me` through the shared Bearer client, always sending all three fields because the API replaces them). `/account/profile` alias. | Unit T05, T06, validation and 422 cases, T13b (401); Live `PUT /profiles/me`, then `GET /auth/me` reflects it; E2E profile read, and the update is checked again through the API | PASS |
| DO-04 | Identify every view (outside the public website) that needs a session. | [`AUTH-02-ROUTE-MATRIX.md`](./AUTH-02-ROUTE-MATRIX.md): there are 3 frontend applications. Six private views are protected: 4 inventory routes, the profile and the supplier directory. | Unit `routes.test.ts` (exact `PROTECTED_ROUTES` set) and T07 for each route; E2E redirects | PASS |
| DO-05 | Client-side guard that checks the token in `localStorage` and redirects to `/login` when it is missing or invalid. No server middleware is used. | SPA: `inventory/src/app.ts` `render()`. No token → `/backoffice/login?next=…`. With a token, a neutral "Verificando tu sesión…" state is shown until `GET /auth/me` answers: 401 → token removed → login; network/5xx → retry panel (token kept). Supplier page: same flow in `suppliers/supplier-directory.js` with `<main hidden>` until verified. JWT claims are only used to drop already-expired tokens. The API decides validity. | Unit T07, T08a (forged token → `/auth/me` 401), T08b (expired), T09, T15 (no flash), unreachable-API retry, supplier-directory guard (7 tests); E2E forged token → login | PASS |
| DO-06 | The public website (Hito 1) is not affected: no token check, no redirect. | No file under `uis/website/` changed. It loads no auth script. | Unit `public-website.test.ts` (static scan of every file and a jsdom load); E2E opens `index.html` and `application.html` on their own origin without a token (no redirect, no storage) | PASS |
| DO-07 | Login and registration store the token in `localStorage`. | `auth-session.ts` `createTokenStore()`, key `nexova.auth.token`. It is SSR-safe and falls back to memory when `window` or storage is unavailable. | Unit T01, T03, "uses one key", SSR suite (`@jest-environment node`); Live; E2E "full reload keeps the session" | PASS |
| DO-08 | Every protected call reads the token and sends `Authorization: Bearer <token>`. | One client, `inventory/src/lib/http.ts` `createApiClient()`, used by inventory and profile. `GET /auth/me` goes through `auth-session.ts`. The supplier page builds `api()` from `session.getAuthorizationHeader()`. | Unit T11 (every protected call carries the stored token; the auth endpoints do not), supplier Bearer test; E2E manager token accepted by `/suppliers` | PASS |
| DO-09 | Logout removes the token from `localStorage` and redirects to `/login`. | `app.ts` `onLogout` (→ `/backoffice/login?reason=logout`); supplier page logout button; `storage` event handles logout in another tab. | Unit T12, cross-tab test, supplier logout; E2E "logout removes the token; private view afterwards redirects" | PASS |
| DO-10 | A protected call that returns `401` clears the token and redirects to `/login`. | `http.ts` reports the rejected header to `app.handleUnauthorized()`, which calls `session.logout()` and goes to `/login?reason=session&next=…`. A stale 401 for an older token is ignored. A wrong password never goes through this path, and `/login` never redirects to itself. 403 is shown as a permissions error. | Unit T13, T13b, T14, T14b, T14c, 403 ≠ 401, stale-401; supplier 401 and 403; E2E "real 401 during use…" (account deactivated server-side) and "role user gets a real 403" | PASS |

## Official evaluation — "Qué Vamos a Evaluar" (6)

| ID | Official criterion | Evidence | Status |
|---|---|---|---|
| EVAL-01 | Login and registration forms work end to end, and the token is stored after a successful call. | DO-01, DO-02, DO-07. E2E (real API, real JWT): login → `nexova.auth.token` present; registration through the UI → `POST /users` → `POST /auth/login` → token → main view. Screenshot `auth-02/10-registered-main-view.png`. | PASS |
| EVAL-02 | Protected views redirect to `/login` when storage holds no valid token. | DO-04, DO-05. E2E: no token on the 4 inventory routes and the profile → login. A forged token is rejected by `GET /auth/me` → removed → login. Unit: T07 for all 5 SPA routes, plus the supplier page. | PASS |
| EVAL-03 | The public website (Hito 1) keeps working without any auth check. | DO-06. E2E: both pages load without a token or redirect (`auth-02/11-public-website.png`); `git diff main -- uis/website` is empty. | PASS |
| EVAL-04 | The profile view shows the `User` email and the linked `Profile` name/contact data, and updates via `PUT /profiles/me`. | DO-03. E2E screenshot `auth-02/06-profile.png`; the update is confirmed with an independent `GET /auth/me`. | PASS |
| EVAL-05 | Logout removes the token and redirects correctly. | DO-09. E2E: after logout `localStorage` has no key, the URL is `/backoffice/login?reason=logout`, and the next private view redirects to login. | PASS |
| EVAL-06 | A `401` from any protected call clears the session and redirects to `/login`. | DO-10. E2E: the user is deactivated server-side while signed in, and the next protected call (`GET /auth/me` from the profile) gets a real 401 → token removed → `/backoffice/login?reason=session`. Covered in Unit for inventory, profile and supplier calls. | PASS |

## Platform mismatch (documented, not hidden)

1. **There are no Next.js applications in this monorepo.** The assignment says to integrate into "the existing Next.js applications" and not to build a separate auth app. The frontends that exist here are a static HTML website (Hito 1), a TypeScript SPA compiled with `tsc` (the backoffice shell with inventory and account views) and a vanilla-JS page (supplier directory). See the route matrix. Adding Next.js would have meant building a new application and porting Hito 5, which the assignment rules out. So AUTH-02 is integrated into the existing apps, and each Next.js-specific instruction is applied to them as follows:
   - "Layout guard or hook on the client": `render()` in `inventory/src/app.ts` acts as the layout guard for every SPA route, and `start()` in `supplier-directory.js` guards the supplier page.
   - "Do not use Next.js middleware to read `localStorage`": there is no server-side check at all. `inventory/serve.cjs` only serves the HTML shell, and every decision happens in the browser.
   - Hydration/SSR safety: there is no server rendering. The shell HTML ships with the nav, account tools and supplier `<main>` hidden, and all storage access is guarded (SSR test under `@jest-environment node`).
2. **Route prefix.** The backoffice is served under `/backoffice/`, so the canonical routes are `/backoffice/login`, `/backoffice/register` and `/backoffice/account/profile`. The server answers the literal assignment paths `/login`, `/register` and `/account/profile` with a 302 to those routes, keeping the query string (E2E checks `/register`).
3. **Backend contract.** No mismatch. `POST /auth/login` (OAuth2 form), `GET /auth/me` (`{email, role, profile}`), `POST /users` (`UserRegistration`) and `PUT /profiles/me` (`ProfileFields`) are used exactly as AUTH-01 implements them. No endpoint was added or changed. One point is easy to get wrong: `PUT /profiles/me` replaces all three fields (`model_dump()` without `exclude_unset`), so the client always sends `name`, `phone` and `address`.

## Security notes

- **localStorage and XSS.** The assignment requires `localStorage`. Any script running on the backoffice origin could read the token. This is mitigated as follows: views build DOM with text nodes only (`dom.ts` `h()`; the supplier page escapes all API data), there are no third-party scripts besides the existing Tailwind CDN, the token is never written to logs, the DOM or URLs (unit test "never logs credentials or tokens"; evidence scanned for JWTs), and the API's `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` limits how long a stolen token is useful. An `httpOnly` cookie set by the API would be safer, but it is out of scope because it contradicts the assignment.
- **The backend is the authority.** A token with an unexpired `exp` is still not trusted until `GET /auth/me` accepts it. A forged token is rejected in Unit, Live and E2E. Roles shown in the UI are informational only. Supplier access is decided by the API (403 for `user`).
- **No open redirects.** `safeNextPath()` accepts only private backoffice paths on the same origin.
- **One auth module, one token key.** `NexovaAuth` (`suppliers/src/auth-session.ts`) is the only auth code, and both private pages load the same bundle with the same key `nexova.auth.token`. The bundle is built by `inventory/scripts/build-auth-bundle.cjs`. That build step existed only on the sibling branch `feature/bullet-proof-applications` and has been ported here so the committed `dist/` can be reproduced.
- **Behaviour change versus Hito 5.** Hito 5 kept the JWT in memory, so a reload logged the user out. AUTH-02 requires persistence, so the Hito 5 E2E check "reload drops the session" was replaced by "reload keeps the session (re-verified with `/auth/me`)".

## Additional fix found by the browser run

On the login page, `#account-tools` (with the logout button) was visible even though it had the `hidden` attribute. Tailwind's `.flex` utility on the same element overrode it. The bug predates AUTH-02. The layout class now sits on an inner wrapper, and E2E asserts `display: none` on the login page.

## Dependency

`main` does not yet contain AUTH-01 or the earlier milestones. PRs #4 (supplier directory), #5 (AUTH-01), #9 (inventory ORM) and #10 (Hito 5 UI) are still open. This branch is stacked on #10, so the PR against `main` also shows those commits until they are merged in order (#4 → #5 → #9 → #10 → this PR). The AUTH-02 changes alone can be reviewed with `git diff feature/inventory-backoffice...feature/auth-frontend`.
