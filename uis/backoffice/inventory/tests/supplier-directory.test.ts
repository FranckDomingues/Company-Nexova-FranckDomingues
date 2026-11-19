/**
 * AUTH-02 guard of the second private page: the supplier directory (uis/backoffice/index.html +
 * suppliers/supplier-directory.js), executed as-is in jsdom with the real NexovaAuth module and a
 * SIMULATED backend. Real browser redirects are verified in e2e/run-e2e.mjs (jsdom cannot navigate).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../../suppliers/src/auth-session';
import { createAuthBackend, fakeJwt, KEY, pathOf } from './auth-fixtures';
import { flush, mockFetch } from './helpers';

const BACKOFFICE = join(__dirname, '../..');
const SCRIPT = readFileSync(join(BACKOFFICE, 'suppliers/supplier-directory.js'), 'utf8');
const BODY = new DOMParser().parseFromString(readFileSync(join(BACKOFFICE, 'index.html'), 'utf8'), 'text/html').body.innerHTML;
const SUPPLIER = { id: 7, name: 'Indeed', country: 'Spain', categories: ['job_boards'], monthly_rate: 450, currency: 'EUR', status: 'active', contract_renewal_date: null, contact_email: null, notes: null, updated_at: '2026-11-18T00:00:00Z' };

let consoleError: jest.SpyInstance;
beforeEach(() => {
  window.localStorage.clear();
  // jsdom reports location.replace() as "not implemented"; the real redirect is covered by the E2E run.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

async function openDirectory(backend: ReturnType<typeof createAuthBackend>) {
  backend.overrides['GET /suppliers'] = call => {
    const user = backend.tokens.get((call.headers.Authorization ?? '').slice(7));
    if (!user) return { status: 401, body: { detail: 'Invalid or expired bearer token' } };
    return ['manager', 'admin'].includes(user.role) ? { body: [SUPPLIER] } : { status: 403, body: { detail: 'Insufficient permissions' } };
  };
  const { fetcher, calls } = mockFetch(backend.handler);
  (globalThis as { fetch: typeof fetch }).fetch = fetcher;
  document.body.innerHTML = BODY;
  new Function(SCRIPT)();
  await flush(10);
  const main = document.getElementById('main')!;
  return { calls, main, status: document.getElementById('auth-status')! };
}

describe('supplier directory guard', () => {
  it('is hidden in the static HTML until the session is verified (no flash)', () => {
    document.body.innerHTML = BODY;
    expect(document.getElementById('main')!.hidden).toBe(true);
    expect(document.getElementById('account-tools')!.hidden).toBe(true);
    expect(document.getElementById('auth-status')!.textContent).toBe('Verificando tu sesión…');
  });

  it('no token: nothing is fetched and the page stays hidden (redirect to /backoffice/login)', async () => {
    const { calls, main } = await openDirectory(createAuthBackend({ role: 'manager' }));
    expect(calls).toHaveLength(0);
    expect(main.hidden).toBe(true);
  });

  it('valid manager token: verified, Bearer sent to /suppliers, list rendered, account shown', async () => {
    const backend = createAuthBackend({ role: 'manager' });
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls, main, status } = await openDirectory(backend);
    expect(calls.map(pathOf)).toEqual(['GET /auth/me', 'GET /suppliers']);
    expect(calls.every(c => c.headers.Authorization === `Bearer ${backend.validToken}`)).toBe(true);
    expect(main.hidden).toBe(false);
    expect(status.hidden).toBe(true);
    expect(document.getElementById('supplier-rows')!.textContent).toContain('Indeed');
    expect(document.querySelector('[data-account-email]')!.textContent).toBe('ana@nexova.example');
  });

  it('403 (role "user") is a permissions message, NOT a logout', async () => {
    const backend = createAuthBackend({ role: 'user' });
    window.localStorage.setItem(KEY, backend.validToken);
    await openDirectory(backend);
    expect(document.getElementById('page-message')!.textContent).toContain('no tiene permisos');
    expect(window.localStorage.getItem(KEY)).toBe(backend.validToken);
  });

  it('invalid token: /auth/me 401 removes it before any supplier request', async () => {
    window.localStorage.setItem(KEY, fakeJwt('1', 3600, 'forged'));
    const { calls, main } = await openDirectory(createAuthBackend({ role: 'manager' }));
    expect(calls.map(pathOf)).toEqual(['GET /auth/me']);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(main.hidden).toBe(true);
  });

  it('a 401 from /suppliers during use clears the session', async () => {
    const backend = createAuthBackend({ role: 'manager' });
    window.localStorage.setItem(KEY, backend.validToken);
    const original = backend.handler;
    const { calls } = await openDirectory({ ...backend, handler: async call => (pathOf(call) === 'GET /suppliers' ? { status: 401, body: { detail: 'Invalid or expired bearer token' } } : original(call)) });
    expect(calls.map(pathOf)).toEqual(['GET /auth/me', 'GET /suppliers']);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('logout button removes the token', async () => {
    const backend = createAuthBackend({ role: 'manager' });
    window.localStorage.setItem(KEY, backend.validToken);
    await openDirectory(backend);
    (document.querySelector('[data-logout]') as HTMLButtonElement).click();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
