import { createAuthSession, getTokenExpiration, isTokenExpired, validateLoginInput } from './auth-session';

function tokenWithPayload(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

 describe('auth utilities', () => {
  test('validates login fields and rejects missing, malformed, or empty credentials', () => {
    expect(validateLoginInput(' person@example.com ', 'secret')).toBeNull();
    expect(validateLoginInput('', 'secret')).toMatch(/correo/);
    expect(validateLoginInput('not-an-email', 'secret')).toMatch(/válido/);
    expect(validateLoginInput('person@example.com', '')).toMatch(/contraseña/);
    expect(validateLoginInput(null, 1)).toMatch(/correo/);
  });

  test('parses finite exp claims and handles malformed base64/json and absent/nonnumeric exp safely', () => {
    expect(getTokenExpiration(tokenWithPayload({ exp: 1234 }))).toBe(1234);
    expect(getTokenExpiration(tokenWithPayload({ exp: '1234' }))).toBeNull();
    expect(getTokenExpiration(tokenWithPayload({}))).toBeNull();
    expect(getTokenExpiration('a.@@@.c')).toBeNull();
    expect(getTokenExpiration('a.b.c')).toBeNull();
    expect(getTokenExpiration('a.bnVsbA.c')).toBeNull();
    expect(getTokenExpiration('a.' + Buffer.from('{bad').toString('base64url') + '.c')).toBeNull();
    expect(getTokenExpiration('a.' + Buffer.from('[]').toString('base64url') + '.c')).toBeNull();
  });

  test('expiry is inclusive at boundary, accepts future exp, and treats malformed tokens as expired', () => {
    const token = tokenWithPayload({ exp: 1001 });
    expect(isTokenExpired(token, 1000)).toBe(false);
    expect(isTokenExpired(token, 1001)).toBe(true);
    expect(isTokenExpired(token, Number.NaN)).toBe(true);
    expect(isTokenExpired('bad', 0)).toBe(true);
  });
});

describe('in-memory auth session', () => {
  const validToken = tokenWithPayload({ exp: 2000 });
  const account = { email: 'person@example.com', role: 'manager', profile: { first_name: 'Ana' } };

  test('logs in, verifies current account, and exposes bearer header without browser storage', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response({ access_token: validToken, token_type: 'bearer' }))
      .mockResolvedValueOnce(response(account));
    const session = createAuthSession({ apiBase: 'https://api.example.test', fetcher, now: () => 1000 });
    await expect(session.login({ username: ' person@example.com ', password: 'secret' })).resolves.toEqual(account);
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.example.test/auth/login', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=person%40example.com&password=secret',
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.example.test/auth/me', { headers: { Authorization: `Bearer ${validToken}` } });
    expect(session.account).toEqual(account);
    expect(session.getAuthorizationHeader()).toBe(`Bearer ${validToken}`);
  });

  test('clears credentials after logout and when token reaches expiry', async () => {
    let clock = 1000;
    const fetcher = jest.fn().mockResolvedValueOnce(response({ access_token: validToken })).mockResolvedValueOnce(response(account));
    const session = createAuthSession({ apiBase: '', fetcher, now: () => clock });
    await session.login({ username: 'person@example.com', password: 'x' });
    clock = 2000;
    expect(session.getAuthorizationHeader()).toBeNull();
    expect(session.account).toBeNull();
    clock = 1000;
    const secondFetch = jest.fn().mockResolvedValueOnce(response({ access_token: validToken })).mockResolvedValueOnce(response(account));
    const secondSession = createAuthSession({ apiBase: '', fetcher: secondFetch, now: () => clock });
    await secondSession.login({ username: 'person@example.com', password: 'x' });
    secondSession.logout();
    expect(secondSession.getAuthorizationHeader()).toBeNull();
    expect(secondSession.account).toBeNull();
  });

  test('rejects login API failures and malformed token responses', async () => {
    const apiFailure = createAuthSession({ apiBase: '', fetcher: jest.fn().mockResolvedValue(response({ detail: 'bad credentials' }, 401)) });
    await expect(apiFailure.login({ username: 'person@example.com', password: 'bad' })).rejects.toThrow('bad credentials');
    const malformed = createAuthSession({ apiBase: '', fetcher: jest.fn().mockResolvedValue(response({ token_type: 'bearer' })) });
    await expect(malformed.login({ username: 'person@example.com', password: 'x' })).rejects.toThrow(/token Bearer/);
    const expired = createAuthSession({ apiBase: '', now: () => 2000, fetcher: jest.fn().mockResolvedValue(response({ access_token: validToken })) });
    await expect(expired.login({ username: 'person@example.com', password: 'x' })).rejects.toThrow(/expirado/);
    const invalidInput = createAuthSession({ apiBase: '', fetcher: jest.fn() });
    await expect(invalidInput.login({ username: 'bad', password: 'x' })).rejects.toThrow(/correo/);
    expect(invalidInput.getAuthorizationHeader()).toBeNull();
  });

  test('rejects /auth/me failures or malformed account and clears token', async () => {
    const authFailure = createAuthSession({ apiBase: '', now: () => 1000, fetcher: jest.fn()
      .mockResolvedValueOnce(response({ access_token: validToken })).mockResolvedValueOnce(response({ detail: 'inactive' }, 401)) });
    await expect(authFailure.login({ username: 'person@example.com', password: 'x' })).rejects.toThrow('inactive');
    expect(authFailure.getAuthorizationHeader()).toBeNull();
    const malformedAccount = createAuthSession({ apiBase: '', now: () => 1000, fetcher: jest.fn()
      .mockResolvedValueOnce(response({ access_token: validToken })).mockResolvedValueOnce(response({ email: 'x' })) });
    await expect(malformedAccount.login({ username: 'person@example.com', password: 'x' })).rejects.toThrow(/formato/);
    expect(malformedAccount.account).toBeNull();
  });
});
