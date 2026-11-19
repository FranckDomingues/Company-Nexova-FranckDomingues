/** AUTH-02 unit tests of the single NexovaAuth module (uis/backoffice/suppliers/src/auth-session.ts). */
import { AuthError, createAuthSession, createTokenStore, NexovaAuth } from '../../suppliers/src/auth-session';
import { createAuthBackend, EMAIL, fakeJwt, KEY, PASSWORD, pathOf } from './auth-fixtures';
import { mockFetch } from './helpers';

beforeEach(() => window.localStorage.clear());

function setup(handler = createAuthBackend().handler) {
  const { fetcher, calls } = mockFetch(handler);
  return { session: createAuthSession({ apiBase: 'http://api.test/', fetcher }), calls };
}

describe('token storage (AUTH02-07)', () => {
  it('uses one key, nexova.auth.token, in localStorage', async () => {
    const backend = createAuthBackend();
    const { session } = setup(backend.handler);
    await session.login({ username: EMAIL, password: PASSWORD });
    expect(Object.keys(window.localStorage)).toEqual([KEY]);
    expect(backend.tokens.has(window.localStorage.getItem(KEY)!)).toBe(true);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('degrades to memory when storage is unavailable or throws (privacy modes, SSR)', () => {
    const memoryOnly = createTokenStore(null);
    memoryOnly.set('a.b.c');
    expect(memoryOnly.get()).toBe('a.b.c');
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } } as unknown as Storage;
    const guarded = createTokenStore(throwing);
    expect(() => guarded.set('x.y.z')).not.toThrow();
    expect(guarded.get()).toBe('x.y.z');
    guarded.clear();
    expect(guarded.get()).toBeNull();
  });

  it('a new session (page reload) restores the stored token but is unverified until GET /auth/me', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { session, calls } = setup(backend.handler);
    expect(session.getAuthorizationHeader()).toBe(`Bearer ${backend.validToken}`);
    expect(session.isVerified()).toBe(false);
    expect(session.account).toBeNull();
    expect(await session.verify()).toMatchObject({ email: EMAIL });
    expect(session.isVerified()).toBe(true);
    expect(calls.map(pathOf)).toEqual(['GET /auth/me']);
  });

  it('a malformed stored value is discarded, never sent', () => {
    window.localStorage.setItem(KEY, 'not-a-jwt');
    const { session } = setup();
    expect(session.getAuthorizationHeader()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe('session verification — the API is the authority (AUTH02-05)', () => {
  it('a token with a valid-looking, unexpired exp claim is NOT trusted until the API accepts it', async () => {
    window.localStorage.setItem(KEY, fakeJwt('1', 3600, 'forged'));
    const { session } = setup();
    expect(session.isVerified()).toBe(false);
    expect(await session.verify()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ['network failure', () => Promise.reject(new TypeError('offline')), 0],
    ['HTTP 500', () => ({ status: 500, body: { detail: 'boom' } }), 500],
    ['HTTP 403', () => ({ status: 403, body: { detail: 'Insufficient permissions' } }), 403],
  ])('%s while verifying throws and KEEPS the token (only 401 invalidates)', async (_label, reply, status) => {
    const backend = createAuthBackend();
    backend.overrides['GET /auth/me'] = reply as never;
    window.localStorage.setItem(KEY, backend.validToken);
    const { session } = setup(backend.handler);
    await expect(session.verify()).rejects.toMatchObject({ name: 'AuthError', status });
    expect(window.localStorage.getItem(KEY)).toBe(backend.validToken);
    expect(session.isVerified()).toBe(false);
  });

  it('concurrent verifications share one request', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { session, calls } = setup(backend.handler);
    await Promise.all([session.verify(), session.verify(), session.verify()]);
    expect(calls).toHaveLength(1);
  });

  it('logout during a pending verification wins (nothing is restored)', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { session } = setup(backend.handler);
    const pending = session.verify();
    session.logout();
    expect(await pending).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(session.isVerified()).toBe(false);
  });
});

describe('login / register contracts', () => {
  it('login stores nothing if GET /auth/me rejects the fresh token', async () => {
    const backend = createAuthBackend();
    backend.overrides['GET /auth/me'] = () => ({ status: 401, body: { detail: 'Invalid or expired bearer token' } });
    const { session } = setup(backend.handler);
    await expect(session.login({ username: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(AuthError);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('maps "Inactive account" to a clear Spanish message', async () => {
    const backend = createAuthBackend();
    backend.overrides['POST /auth/login'] = () => ({ status: 401, body: { detail: 'Inactive account' } });
    const { session } = setup(backend.handler);
    await expect(session.login({ username: EMAIL, password: PASSWORD })).rejects.toMatchObject({ status: 401, message: 'Esta cuenta está desactivada. Contacta con un administrador.' });
  });

  it('register omits empty optional fields and never sends role/is_active', async () => {
    const { session, calls } = setup();
    await session.register({ email: 'b@nexova.example', password: 'password-123', name: '  ', phone: null, address: ' Calle 2 ' });
    expect(calls[0].body).toEqual({ email: 'b@nexova.example', password: 'password-123', address: 'Calle 2' });
  });

  it('validateRegistrationInput mirrors the API limits', () => {
    expect(NexovaAuth.validateRegistrationInput({ email: 'a@b.co', password: 'x'.repeat(8) })).toEqual({});
    expect(NexovaAuth.validateRegistrationInput({ email: 'a@b.co', password: 'x'.repeat(129), name: 'n'.repeat(201), address: 'a'.repeat(501) }))
      .toEqual({ password: expect.any(String), name: 'Máximo 200 caracteres.', address: 'Máximo 500 caracteres.' });
  });
});

describe('secrets hygiene', () => {
  it('never logs credentials or tokens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => undefined));
    const backend = createAuthBackend();
    const { session } = setup(backend.handler);
    await session.login({ username: EMAIL, password: PASSWORD });
    await session.login({ username: EMAIL, password: 'wrong-password' }).catch(() => undefined);
    session.logout();
    const logged = spies.flatMap(spy => spy.mock.calls.flat().map(String)).join('\n');
    expect(logged).not.toContain(PASSWORD);
    for (const token of backend.tokens.keys()) expect(logged).not.toContain(token);
    spies.forEach(spy => spy.mockRestore());
  });
});
