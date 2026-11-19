# AUTH-02 — Route matrix (AUTH02-04)

This inventory covers every frontend application in the monorepo. It was produced by searching the whole tree for `package.json`, `next.config.*` and HTML entry points, excluding `node_modules`.

**Next.js applications found: 0.** The assignment assumes Next.js, but this monorepo's frontends are plain HTML/TypeScript (see *Platform mismatch* in [`AUTH-02-CHECKLIST.md`](./AUTH-02-CHECKLIST.md)). The guard strategy below is the client-side equivalent of the Next.js "layout guard/hook" the assignment describes.

## Applications

| # | Application | Location | Technology | Visibility | Guard |
|---|---|---|---|---|---|
| 1 | Public website (Hito 1) | `uis/website/` | Static HTML, Tailwind CDN, `validation.js` | **Public** | **None, by design.** No auth script, token read or redirect. Unchanged by AUTH-02. |
| 2 | Backoffice SPA (inventory and account) | `uis/backoffice/inventory/` (`index.html` shell, `src/` → `dist/`) | TypeScript ES modules, client-side router, `NexovaAuth` | **Private**, apart from the guest-only login and register views | Client guard in `src/app.ts` `render()` |
| 3 | Supplier directory | `uis/backoffice/index.html` + `suppliers/supplier-directory.js` | Vanilla JS page, `NexovaAuth` | **Private** | Client guard in `supplier-directory.js` `start()` |

`uis/backoffice/suppliers/index.html` is only a meta-refresh to `../index.html#main` (application 3). It has no content of its own.

Applications 2 and 3 are both served by `uis/backoffice/inventory/serve.cjs`, so they share one origin and one `localStorage` token (`nexova.auth.token`). The public website is served separately.

## Routes

| Route | App | Access | Guard behaviour | API calls (all with `Authorization: Bearer`) |
|---|---|---|---|---|
| `/backoffice/login` (`/login` → 302) | 2 | Public (guest-only) | No token → form. A stored token is verified with `GET /auth/me`: valid → go to `?next`, invalid → removed, form shown (no loop). | `POST /auth/login` (no Bearer), then `GET /auth/me` |
| `/backoffice/register` (`/register` → 302) | 2 | Public (guest-only) | Same as login | `POST /users`, `POST /auth/login` (no Bearer), then `GET /auth/me` |
| `/backoffice/account/profile` (`/account/profile` → 302) | 2 | **Protected** | Token required and verified | `GET /auth/me`, `PUT /profiles/me` |
| `/backoffice/inventory/products` | 2 | **Protected** | Token required and verified | `GET /inventory/products` |
| `/backoffice/inventory/orders/inbound` | 2 | **Protected** | Token required and verified | `GET /inventory/products`, `POST /inventory/orders/inbound` |
| `/backoffice/inventory/orders/outbound` | 2 | **Protected** | Token required and verified | `GET /inventory/products`, `POST /inventory/orders/outbound` |
| `/backoffice/inventory/orders` | 2 | **Protected** | Token required and verified | `GET /inventory/orders` |
| `/backoffice/` (`/backoffice/index.html`) | 3 | **Protected** | Token required and verified; `<main hidden>` until then | `GET /suppliers`, `POST /suppliers`, `PATCH /suppliers/{id}/rate`, `PATCH /suppliers/{id}/status` (API requires role `manager`/`admin`; `user` gets a 403 message, not a logout) |
| `/backoffice/inventory` and unknown `/backoffice/inventory/*` | 2 | Protected | Redirect to `/backoffice/inventory/products`, then guarded | — |
| `/` (backoffice server) | — | — | 302 → `/backoffice/` (unchanged) | — |
| `/index.html` | 1 | **Public** | None | None |
| `/application.html` | 1 | **Public** | None | None (client-side form validation only) |

**Protected views (6):** the profile, the four inventory routes and the supplier directory.

## Guard strategy (applications 2 and 3)

1. **Before any private markup:** the shell HTML ships with the nav, account tools and supplier `<main>` set to `hidden`. Nothing private exists before JavaScript decides.
2. **Token presence:** `session.getAuthorizationHeader()` reads `localStorage` (all access guarded). A malformed token or one past its `exp` is removed immediately. With no token, the guard redirects to `/backoffice/login?next=<path>` and makes no API call.
3. **Token validity:** a present token is validated once per page load with `GET /auth/me`. The JWT is not trusted from its claims. While the call is pending, only "Verificando tu sesión…" (`aria-busy`) is shown. A 401 removes the token and redirects to `/backoffice/login?reason=session&next=…`. A network error or 5xx shows a retry panel and keeps the token, because those failures say nothing about the token.
4. **During use:** every protected call goes through one client (`inventory/src/lib/http.ts`, or `api()` on the supplier page). On a 401 the session is cleared and the user goes to login, unless a newer login has already replaced the rejected token. A 403 is shown as a permissions error.
5. **Cross-tab:** a `storage` event on `nexova.auth.token` re-runs the guard, so logging out in one tab closes the session in the others.
6. **Post-login destination:** `safeNextPath()` allows only the paths in this table (no open redirect). SPA routes are rendered in place, and the supplier page is opened with a full page load.
