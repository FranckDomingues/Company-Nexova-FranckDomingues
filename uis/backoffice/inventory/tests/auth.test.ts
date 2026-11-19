/**
 * AUTH-02 frontend authentication flows — SIMULATED backend (tests/auth-fixtures.ts), REAL NexovaAuth
 * module, real HTTP client, real views, jsdom localStorage. Numbers refer to the AUTH-02 test plan
 * (docs/evidence/AUTH-02-TEST-REPORT.md).
 */
import { PATHS } from '../src/context';
import { createAuthBackend, EMAIL, fakeJwt, KEY, PASSWORD, pathOf, realSession } from './auth-fixtures';
import { $, flush, mountApp, setValue, submit } from './helpers';

const stored = () => window.localStorage.getItem(KEY);
const here = () => window.location.pathname + window.location.search;

beforeEach(() => window.localStorage.clear());

async function login(email = EMAIL, password = PASSWORD) {
  setValue('input[name="username"]', email);
  setValue('input[name="password"]', password);
  await submit('#login-form');
  await flush();
}

describe('AUTH02-01 / AUTH02-07 login', () => {
  it('T01 successful login persists the real token in localStorage and opens the requested view', async () => {
    const backend = createAuthBackend();
    const { calls, session } = await mountApp(`${PATHS.login}?next=${encodeURIComponent(PATHS.orders)}`, { makeSession: realSession, handler: backend.handler });
    await login();
    const loginCall = calls.find(c => pathOf(c) === 'POST /auth/login')!;
    expect(loginCall.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(loginCall.body).toEqual({ username: EMAIL, password: PASSWORD });
    const token = stored();
    expect(token && backend.tokens.has(token)).toBe(true);
    expect(session.getAuthorizationHeader()).toBe(`Bearer ${token}`);
    expect(here()).toBe(PATHS.orders);
    expect(document.querySelector('#order-rows')).not.toBeNull();
    expect($('[data-account-email]').textContent).toBe(EMAIL);
  });

  it('T02 invalid credentials show a clear error, store nothing and stay on /login', async () => {
    const backend = createAuthBackend();
    const { calls } = await mountApp(`${PATHS.login}?next=${encodeURIComponent(PATHS.orders)}`, { makeSession: realSession, handler: backend.handler });
    await login(EMAIL, 'wrong-password');
    expect($('#login-error').textContent).toBe('Correo electrónico o contraseña incorrectos.');
    expect(stored()).toBeNull();
    expect(here()).toBe(`${PATHS.login}?next=${encodeURIComponent(PATHS.orders)}`);
    expect(calls.map(pathOf)).toEqual(['POST /auth/login']);
  });

  it('client-side validation blocks empty or malformed credentials without calling the API', async () => {
    const { calls } = await mountApp(PATHS.login, { makeSession: realSession, handler: createAuthBackend().handler });
    await login('not-an-email', 'x');
    expect($('#login-error').textContent).toBe('Introduce un correo electrónico válido.');
    expect(calls).toHaveLength(0);
  });

  it('a network failure during login is reported, not treated as a wrong password', async () => {
    const { root } = await mountApp(PATHS.login, { makeSession: realSession, handler: () => 'network-error' as never });
    await login();
    expect($('#login-error').textContent).toContain('No se pudo conectar');
    expect(root.querySelector('#login-form')).not.toBeNull();
  });
});

describe('AUTH02-02 registration', () => {
  it('T03 POST /users with the backend contract, then POST /auth/login with the same credentials; token persisted', async () => {
    const backend = createAuthBackend();
    const { calls } = await mountApp(PATHS.register, { makeSession: realSession, handler: backend.handler });
    setValue('#reg-email', '  nuevo@nexova.example ');
    setValue('#reg-password', 'otra-clave-segura');
    setValue('#reg-name', ' Luis Gómez ');
    setValue('#reg-phone', '+54 11 5555 0000');
    setValue('#reg-address', '');
    await submit('#register-form');
    await flush();
    expect(calls.map(pathOf)).toEqual(['POST /users', 'POST /auth/login', 'GET /auth/me', 'GET /inventory/products']);
    expect(calls[0].body).toEqual({ email: 'nuevo@nexova.example', password: 'otra-clave-segura', name: 'Luis Gómez', phone: '+54 11 5555 0000' });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[1].body).toEqual({ username: 'nuevo@nexova.example', password: 'otra-clave-segura' });
    expect(backend.tokens.get(stored()!)?.email).toBe('nuevo@nexova.example');
    expect(here()).toBe(PATHS.products);
    expect($('[data-account-email]').textContent).toBe('nuevo@nexova.example');
  });

  it('T04a client validation: field-level errors and no request', async () => {
    const { calls } = await mountApp(PATHS.register, { makeSession: realSession, handler: createAuthBackend().handler });
    setValue('#reg-email', 'sin-arroba');
    setValue('#reg-password', 'corta');
    setValue('#reg-phone', '9'.repeat(51));
    await submit('#register-form');
    expect($('#reg-email-error').textContent).toBe('Introduce un correo electrónico válido.');
    expect($('#reg-password-error').textContent).toBe('La contraseña debe tener entre 8 y 128 caracteres.');
    expect($('#reg-phone-error').textContent).toBe('Máximo 50 caracteres.');
    expect($('#reg-email').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('#reg-email'));
    expect(calls).toHaveLength(0);
  });

  it('T04b API 409 duplicate email is shown on the email field; nothing stored', async () => {
    const { calls } = await mountApp(PATHS.register, { makeSession: realSession, handler: createAuthBackend().handler });
    setValue('#reg-email', EMAIL);
    setValue('#reg-password', 'valid-password');
    await submit('#register-form');
    expect($('#reg-email-error').textContent).toContain('ya está registrado');
    expect($('#register-status').textContent).toContain('Ya existe una cuenta');
    expect(calls.map(pathOf)).toEqual(['POST /users']);
    expect(stored()).toBeNull();
    expect(here()).toBe(PATHS.register);
  });

  it('T04c API 422 field errors are mapped beside the field', async () => {
    const backend = createAuthBackend();
    backend.overrides['POST /users'] = () => ({ status: 422, body: { detail: [{ loc: ['body', 'address'], msg: 'String should have at most 500 characters' }] } });
    await mountApp(PATHS.register, { makeSession: realSession, handler: backend.handler });
    setValue('#reg-email', 'otra@nexova.example');
    setValue('#reg-password', 'valid-password');
    await submit('#register-form');
    expect($('#reg-address-error').textContent).toBe('Máximo 500 caracteres.');
    expect(stored()).toBeNull();
  });

  it('account created but automatic login failed: explicit message and link to /login', async () => {
    const backend = createAuthBackend();
    backend.overrides['POST /auth/login'] = () => ({ status: 503, body: { detail: 'Service unavailable' } });
    await mountApp(PATHS.register, { makeSession: realSession, handler: backend.handler });
    setValue('#reg-email', 'tercera@nexova.example');
    setValue('#reg-password', 'valid-password');
    await submit('#register-form');
    expect($('#register-status').textContent).toContain('Tu cuenta se creó, pero no se pudo iniciar sesión');
    expect(document.querySelector(`#register-status a[href="${PATHS.login}"]`)).not.toBeNull();
    expect(stored()).toBeNull();
  });
});

describe('AUTH02-03 profile', () => {
  it('T05 reads the account and linked profile with GET /auth/me', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls } = await mountApp(PATHS.profile, { makeSession: realSession, handler: backend.handler });
    const value = (k: string) => $(`[data-profile-value="${k}"]`).textContent;
    expect(value('email')).toBe(EMAIL);
    expect(value('role')).toBe('user');
    expect(value('name')).toBe('Ana Pérez');
    expect(value('phone')).toBe('+34 600 111 222');
    expect(value('address')).toBe('Calle Colón 1, Valencia');
    expect(($('#profile-name') as HTMLInputElement).value).toBe('Ana Pérez');
    expect(calls.every(c => pathOf(c) === 'GET /auth/me' && c.headers.Authorization === `Bearer ${backend.validToken}`)).toBe(true);
  });

  it('T06 updates name/phone/address with PUT /profiles/me (full field set, Bearer token)', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls } = await mountApp(PATHS.profile, { makeSession: realSession, handler: backend.handler });
    setValue('#profile-name', ' Ana P. Martínez ');
    setValue('#profile-phone', '');
    setValue('#profile-address', 'Av. Corrientes 100, Buenos Aires');
    await submit('#profile-form');
    const put = calls.find(c => pathOf(c) === 'PUT /profiles/me')!;
    expect(put.headers.Authorization).toBe(`Bearer ${backend.validToken}`);
    expect(put.body).toEqual({ name: 'Ana P. Martínez', phone: null, address: 'Av. Corrientes 100, Buenos Aires' });
    expect($('[data-profile-value="name"]').textContent).toBe('Ana P. Martínez');
    expect($('[data-profile-value="phone"]').textContent).toBe('—');
    expect($('#profile-status').textContent).toContain('Perfil actualizado correctamente.');
  });

  it('profile validation: too-long field blocked client-side; API 422 shown inline', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls } = await mountApp(PATHS.profile, { makeSession: realSession, handler: backend.handler });
    setValue('#profile-name', 'x'.repeat(201));
    await submit('#profile-form');
    expect($('#profile-name-error').textContent).toBe('Máximo 200 caracteres.');
    expect(calls.some(c => pathOf(c) === 'PUT /profiles/me')).toBe(false);
    backend.overrides['PUT /profiles/me'] = () => ({ status: 422, body: { detail: [{ loc: ['body', 'phone'], msg: 'String should have at most 50 characters' }] } });
    setValue('#profile-name', 'Ana');
    await submit('#profile-form');
    expect($('#profile-phone-error').textContent).toContain('at most 50');
    expect(stored()).toBe(backend.validToken);
  });
});

describe('AUTH02-05 route protection', () => {
  const PRIVATE = [PATHS.products, PATHS.inbound, PATHS.outbound, PATHS.orders, PATHS.profile];

  it.each(PRIVATE)('T07 no token: %s redirects to /login without any API call', async route => {
    const { calls } = await mountApp(route, { makeSession: realSession, handler: createAuthBackend().handler });
    expect(window.location.pathname).toBe(PATHS.login);
    expect(new URLSearchParams(window.location.search).get('next')).toBe(route);
    expect(calls).toHaveLength(0);
    expect($('#inventory-nav').hidden).toBe(true);
  });

  it('T08a invalid (revoked/forged) token: GET /auth/me 401 → token removed → /login?reason=session', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, fakeJwt('1', 3600, 'forged'));
    const { calls } = await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler });
    expect(calls.map(pathOf)).toEqual(['GET /auth/me']);
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
    expect(new URLSearchParams(window.location.search).get('reason')).toBe('session');
    expect(document.querySelector('#product-rows')).toBeNull();
  });

  it('T08b expired token (exp in the past) is discarded without trusting it, then redirect', async () => {
    window.localStorage.setItem(KEY, fakeJwt('1', -60));
    const { calls } = await mountApp(PATHS.orders, { makeSession: realSession, handler: createAuthBackend().handler });
    expect(calls).toHaveLength(0);
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
  });

  it('T09 valid token: protected view renders with nav, account email and API data', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls } = await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler });
    expect(here()).toBe(PATHS.products);
    expect(document.querySelectorAll('#product-rows tr[data-asset-id]').length).toBeGreaterThan(0);
    expect($('#inventory-nav').hidden).toBe(false);
    expect($('[data-account-email]').textContent).toBe(EMAIL);
    expect(calls.map(pathOf)).toEqual(['GET /auth/me', 'GET /inventory/products']);
  });

  it('T15 no protected-content flash: only a neutral "verifying" state until /auth/me answers', async () => {
    const backend = createAuthBackend();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    backend.overrides['GET /auth/me'] = async call => {
      await gate;
      delete backend.overrides['GET /auth/me'];
      return backend.handler(call);
    };
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls, started } = await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler, noFlush: true });
    await flush();
    expect($('#session-check').textContent).toBe('Verificando tu sesión…');
    expect($('#session-check').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('#product-rows, #inbound-form, #outbound-form, #order-rows, #profile-form')).toBeNull();
    expect($('#inventory-nav').hidden).toBe(true);
    expect($('#account-tools').hidden).toBe(true);
    expect($('[data-account-email]').textContent).toBe('');
    expect(calls.map(pathOf)).toEqual(['GET /auth/me']);
    release();
    await started;
    await flush();
    expect(document.querySelector('#session-check')).toBeNull();
    expect(document.querySelectorAll('#product-rows tr[data-asset-id]').length).toBeGreaterThan(0);
  });

  it('API unreachable during verification: error with retry, token kept, nothing private shown', async () => {
    const backend = createAuthBackend();
    let down = true;
    backend.overrides['GET /auth/me'] = call => {
      if (down) return Promise.reject(new TypeError('offline'));
      delete backend.overrides['GET /auth/me'];
      return backend.handler(call);
    };
    window.localStorage.setItem(KEY, backend.validToken);
    await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler });
    expect($('#session-error').textContent).toContain('No se pudo conectar');
    expect(stored()).toBe(backend.validToken);
    expect(document.querySelector('#product-rows')).toBeNull();
    down = false;
    ($('#session-error button') as HTMLButtonElement).click();
    await flush();
    expect(document.querySelectorAll('#product-rows tr[data-asset-id]').length).toBeGreaterThan(0);
  });

  it('a valid session visiting /login or /register is sent on to the app (guest-only views)', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    await mountApp(`${PATHS.register}?next=${encodeURIComponent(PATHS.profile)}`, { makeSession: realSession, handler: backend.handler });
    expect(window.location.pathname).toBe(PATHS.profile);
  });

  it('post-login destination outside the SPA (supplier directory) uses a full page load', async () => {
    const backend = createAuthBackend();
    const { assign } = await mountApp(`${PATHS.login}?next=${encodeURIComponent('/backoffice/')}`, { makeSession: realSession, handler: backend.handler });
    await login();
    expect(assign).toHaveBeenCalledWith('/backoffice/');
  });
});

describe('AUTH02-08 Bearer header', () => {
  it('T11 every protected request carries Authorization: Bearer <stored token>; auth endpoints do not', async () => {
    const backend = createAuthBackend();
    const { calls } = await mountApp(`${PATHS.login}?next=${encodeURIComponent(PATHS.profile)}`, { makeSession: realSession, handler: backend.handler });
    await login();
    setValue('#profile-name', 'Ana');
    await submit('#profile-form');
    $('#inventory-nav a[href="/backoffice/inventory/orders"]').click();
    await flush();
    const token = stored();
    const protectedCalls = calls.filter(c => !['POST /auth/login', 'POST /users'].includes(pathOf(c)));
    expect(protectedCalls.map(pathOf)).toEqual(expect.arrayContaining(['GET /auth/me', 'PUT /profiles/me', 'GET /inventory/orders']));
    expect(protectedCalls.every(c => c.headers.Authorization === `Bearer ${token}`)).toBe(true);
    expect(calls.find(c => pathOf(c) === 'POST /auth/login')!.headers.Authorization).toBeUndefined();
  });
});

describe('AUTH02-09 logout', () => {
  it('T12 logout removes the token, clears client state and blocks private views', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { session, calls } = await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler });
    $('[data-logout]').click();
    await flush();
    expect(stored()).toBeNull();
    expect(session.getAuthorizationHeader()).toBeNull();
    expect(session.account).toBeNull();
    expect(here()).toBe(`${PATHS.login}?reason=logout`);
    expect($('[data-state="logged-out"]').textContent).toBe('Has cerrado sesión correctamente.');
    expect($('#inventory-nav').hidden).toBe(true);
    expect($('[data-account-email]').textContent).toBe('');
    const before = calls.length;
    window.history.pushState({}, '', PATHS.orders);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(window.location.pathname).toBe(PATHS.login);
    expect(calls.length).toBe(before);
  });

  it('logout in another tab (storage event) ends this tab\'s session too', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    await mountApp(PATHS.orders, { makeSession: realSession, handler: backend.handler });
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, oldValue: backend.validToken, newValue: null }));
    await flush();
    expect(window.location.pathname).toBe(PATHS.login);
  });
});

describe('AUTH02-10 401 handling', () => {
  it('T13 a protected API call answering 401 clears the session and redirects to /login?reason=session', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    backend.overrides['GET /inventory/orders'] = () => ({ status: 401, body: { detail: 'Invalid or expired bearer token' } });
    await mountApp(PATHS.orders, { makeSession: realSession, handler: backend.handler });
    await flush();
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
    expect(new URLSearchParams(window.location.search).get('reason')).toBe('session');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(PATHS.orders);
  });

  it('T13b profile update answering 401 (token revoked server-side) clears the session', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    await mountApp(PATHS.profile, { makeSession: realSession, handler: backend.handler });
    backend.revoke(backend.validToken);
    await submit('#profile-form');
    await flush();
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
  });

  it('403 is NOT treated as 401: session kept, permission error shown in place', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    backend.overrides['GET /inventory/orders'] = () => ({ status: 403, body: { detail: 'Insufficient permissions' } });
    await mountApp(PATHS.orders, { makeSession: realSession, handler: backend.handler });
    expect(stored()).toBe(backend.validToken);
    expect(window.location.pathname).toBe(PATHS.orders);
    expect(document.getElementById('app')!.textContent).toContain('Insufficient permissions');
  });

  it('T14 failed login (401) never redirects or loops; one request per attempt', async () => {
    const backend = createAuthBackend();
    const start = `${PATHS.login}?next=${encodeURIComponent(PATHS.products)}&reason=session`;
    const { calls } = await mountApp(start, { makeSession: realSession, handler: backend.handler });
    const historyLength = window.history.length;
    await login(EMAIL, 'bad-1');
    await login(EMAIL, 'bad-2');
    expect(here()).toBe(start);
    expect(window.history.length).toBe(historyLength);
    expect(calls.map(pathOf)).toEqual(['POST /auth/login', 'POST /auth/login']);
    expect($('#login-error').textContent).toBe('Correo electrónico o contraseña incorrectos.');
    expect($('[data-state="session-expired"]')).toBeTruthy();
  });

  it('T14b a stale token on /login is verified once, cleared, and the form is shown (no loop)', async () => {
    window.localStorage.setItem(KEY, fakeJwt('1', 3600, 'stale'));
    const { calls } = await mountApp(PATHS.login, { makeSession: realSession, handler: createAuthBackend().handler });
    expect(calls.map(pathOf)).toEqual(['GET /auth/me']);
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
    expect(document.querySelector('#login-form')).not.toBeNull();
  });

  it('T14c a stray 401 while already on /login does not re-redirect (no nested ?next loop)', async () => {
    const start = `${PATHS.login}?next=${encodeURIComponent(PATHS.orders)}`;
    const { app } = await mountApp(start, { makeSession: realSession, handler: createAuthBackend().handler });
    const historyLength = window.history.length;
    await app.handleUnauthorized(null);
    await app.redirectToLogin('session');
    expect(here()).toBe(start);
    expect(window.history.length).toBe(historyLength);
    expect(document.querySelector('#login-form')).not.toBeNull();
  });

  it('a late 401 for an older token does not sign out a newer session', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { app } = await mountApp(PATHS.products, { makeSession: realSession, handler: backend.handler });
    await app.handleUnauthorized(`Bearer ${fakeJwt('1', 3600, 'older')}`);
    expect(stored()).toBe(backend.validToken);
    expect(window.location.pathname).toBe(PATHS.products);
  });
});
