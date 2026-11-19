/** Item 19: all four routes require authentication and redirect through the login flow. */
import { PROTECTED_ROUTES, safeNextPath } from '../src/app';
import { PATHS } from '../src/context';
import { $, fakeSession, flush, mountApp, setValue, submit } from './helpers';

const ROUTES = [PATHS.products, PATHS.inbound, PATHS.outbound, PATHS.orders];

describe('route protection', () => {
  it('protects exactly the four inventory routes plus the AUTH-02 profile route', () => {
    expect(Object.keys(PROTECTED_ROUTES).sort()).toEqual([...ROUTES, PATHS.profile].sort());
  });

  it.each(ROUTES)('redirects unauthenticated users from %s to login without fetching data', async route => {
    const { calls } = await mountApp(`${route}?asset_id=1`, { session: fakeSession(false) });
    expect(window.location.pathname).toBe(PATHS.login);
    expect(new URLSearchParams(window.location.search).get('next')).toBe(`${route}?asset_id=1`);
    expect(calls).toHaveLength(0);
    expect($('#login-form')).toBeTruthy();
    expect(document.querySelector('#product-rows, #order-rows, #inbound-form, #outbound-form')).toBeNull();
    expect($('#inventory-nav').hidden).toBe(true);
  });

  it('after login, returns to the originally requested route', async () => {
    const session = fakeSession(false);
    await mountApp(`${PATHS.outbound}?asset_id=3`, { session });
    setValue('input[name="username"]', 'ops@nexova.example');
    setValue('input[name="password"]', 'secret-password');
    await submit('#login-form');
    expect(session.login).toHaveBeenCalledWith({ username: 'ops@nexova.example', password: 'secret-password' });
    expect(window.location.pathname + window.location.search).toBe(`${PATHS.outbound}?asset_id=3`);
    expect(($('#asset_id') as HTMLSelectElement).value).toBe('3');
    expect($('#inventory-nav').hidden).toBe(false);
    expect($('[data-account-email]').textContent).toBe('ops@nexova.example');
  });

  it('expired session during use (API 401) sends the user back to login', async () => {
    const session = fakeSession(true);
    await mountApp(PATHS.orders, { session, handler: () => ({ status: 401, body: { detail: 'Invalid or expired bearer token' } }) });
    await flush();
    expect(window.location.pathname).toBe(PATHS.login);
    expect(session.logout).toHaveBeenCalled();
  });

  it('logout clears the session and returns to login', async () => {
    const session = fakeSession(true);
    await mountApp(PATHS.products, { session });
    $('[data-logout]').click();
    await flush();
    expect(session.logout).toHaveBeenCalled();
    expect(window.location.pathname).toBe(PATHS.login);
  });

  it('rejects open redirects in ?next', () => {
    expect(safeNextPath('https://evil.example')).toBe(PATHS.products);
    expect(safeNextPath('//evil.example/backoffice/inventory/')).toBe(PATHS.products);
    expect(safeNextPath(`${PATHS.orders}`)).toBe(PATHS.orders);
  });
});
