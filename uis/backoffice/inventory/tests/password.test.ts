/**
 * AUTH-03 frontend — SIMULATED backend (tests/auth-fixtures.ts), REAL NexovaAuth module, shared HTTP
 * client and views. Real-backend coverage: tests/live.integration.test.ts and e2e/run-e2e.mjs.
 */
import { NexovaAuth } from '../../suppliers/src/auth-session';
import { PATHS } from '../src/context';
import { FORGOT_CONFIRMATION } from '../src/views/forgot-password';
import { createAuthBackend, EMAIL, KEY, PASSWORD, pathOf, realSession } from './auth-fixtures';
import { $, flush, mountApp, setValue, submit } from './helpers';

const stored = () => window.localStorage.getItem(KEY);
const here = () => window.location.pathname + window.location.search;
beforeEach(() => window.localStorage.clear());

describe('AUTH03-F01 /forgot-password', () => {
  it('posts the email, shows the generic confirmation and disables the form (no duplicate requests)', async () => {
    const backend = createAuthBackend();
    const { calls } = await mountApp(PATHS.forgotPassword, { makeSession: realSession, handler: backend.handler });
    setValue('#forgot-email', ` ${EMAIL} `);
    await submit('#forgot-form');
    expect(calls.map(pathOf)).toEqual(['POST /auth/forgot-password']);
    expect(calls[0].body).toEqual({ email: EMAIL });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect($('[data-state="forgot-sent"]').textContent).toBe(FORGOT_CONFIRMATION);
    expect(($('#forgot-form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(($('#forgot-email') as HTMLInputElement).disabled).toBe(true);
    await submit('#forgot-form');
    expect(calls).toHaveLength(1);
  });

  it('shows exactly the same confirmation for an unregistered address', async () => {
    const backend = createAuthBackend();
    await mountApp(PATHS.forgotPassword, { makeSession: realSession, handler: backend.handler });
    setValue('#forgot-email', 'nadie@nexova.example');
    await submit('#forgot-form');
    expect($('#forgot-status').textContent).toBe(FORGOT_CONFIRMATION);
    expect(backend.resetTokens.size).toBe(0);
  });

  it('validates the email client-side without calling the API', async () => {
    const { calls } = await mountApp(PATHS.forgotPassword, { makeSession: realSession, handler: createAuthBackend().handler });
    setValue('#forgot-email', 'no-es-un-correo');
    await submit('#forgot-form');
    expect($('#forgot-email-error').textContent).toBe('Introduce un correo electrónico válido.');
    expect($('#forgot-email').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['network failure', () => Promise.reject(new TypeError('offline')), 'No se pudo conectar'],
    ['HTTP 429', () => ({ status: 429, body: { detail: 'Too many password reset requests. Try again later.' } }), 'demasiadas solicitudes'],
  ])('%s: accessible error and the form is enabled again', async (_label, reply, text) => {
    const backend = createAuthBackend();
    backend.overrides['POST /auth/forgot-password'] = reply as never;
    await mountApp(PATHS.forgotPassword, { makeSession: realSession, handler: backend.handler });
    setValue('#forgot-email', EMAIL);
    await submit('#forgot-form');
    expect($('#forgot-status [role="alert"]').textContent).toContain(text);
    expect(($('#forgot-form button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('[data-state="forgot-sent"]')).toBeNull();
  });

  it('is public: no session check, and a signed-in user is not redirected away', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const { calls } = await mountApp(PATHS.forgotPassword, { makeSession: realSession, handler: backend.handler });
    expect(window.location.pathname).toBe(PATHS.forgotPassword);
    expect(calls).toHaveLength(0);
    expect($('#inventory-nav').hidden).toBe(true);
  });
});

describe('AUTH03-F02 /reset-password', () => {
  it('reads the token, strips it from the URL, validates, posts it and redirects to /login with a success message', async () => {
    const backend = createAuthBackend();
    const token = backend.issueReset();
    window.localStorage.setItem(KEY, backend.validToken); // an old session on this browser
    const { calls } = await mountApp(`${PATHS.resetPassword}?token=${encodeURIComponent(token)}`, { makeSession: realSession, handler: backend.handler });
    expect(window.location.search).toBe('');
    expect(document.body.innerHTML).not.toContain(token);
    setValue('#reset-password', 'una-clave-nueva-1');
    setValue('#reset-confirm', 'una-clave-distinta');
    await submit('#reset-form');
    expect($('#reset-confirm-error').textContent).toBe('Las contraseñas no coinciden.');
    expect(calls).toHaveLength(0);
    setValue('#reset-confirm', 'una-clave-nueva-1');
    await submit('#reset-form');
    await flush();
    expect(calls.map(pathOf)).toEqual(['POST /auth/reset-password']);
    expect(calls[0].body).toEqual({ token, new_password: 'una-clave-nueva-1' });
    expect(here()).toBe(`${PATHS.login}?reason=password-reset`);
    expect($('[data-state="password-reset"]').textContent).toContain('Tu contraseña se ha restablecido');
    expect(stored()).toBeNull();
    expect(backend.users.get(EMAIL)!.password).toBe('una-clave-nueva-1');
  });

  it('enforces the 8–128 policy before calling the API', async () => {
    const backend = createAuthBackend();
    const { calls } = await mountApp(`${PATHS.resetPassword}?token=${backend.issueReset()}`, { makeSession: realSession, handler: backend.handler });
    setValue('#reset-password', 'corta');
    setValue('#reset-confirm', 'corta');
    await submit('#reset-form');
    expect($('#reset-password-error').textContent).toBe('La contraseña debe tener entre 8 y 128 caracteres.');
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['expired', (b: ReturnType<typeof createAuthBackend>) => b.issueReset(EMAIL, true)],
    ['already used', (b: ReturnType<typeof createAuthBackend>) => { const t = b.issueReset(); b.resetTokens.get(t)!.used = true; return t; }],
    ['forged', () => 'forged-token'],
  ])('%s token: clear error and a link back to /forgot-password', async (_label, makeToken) => {
    const backend = createAuthBackend();
    await mountApp(`${PATHS.resetPassword}?token=${makeToken(backend)}`, { makeSession: realSession, handler: backend.handler });
    setValue('#reset-password', 'una-clave-nueva-1');
    setValue('#reset-confirm', 'una-clave-nueva-1');
    await submit('#reset-form');
    expect($('[data-state="reset-invalid"]').textContent).toContain('no es válido, ya se usó o ha caducado');
    expect($(`[data-state="reset-invalid"] a[href="${PATHS.forgotPassword}"]`).textContent).toBe('Solicitar un nuevo enlace');
    expect(document.querySelector('#reset-form')).toBeNull();
    expect(window.location.pathname).toBe(PATHS.resetPassword);
    $(`[data-state="reset-invalid"] a[href="${PATHS.forgotPassword}"]`).click();
    await flush();
    expect(window.location.pathname).toBe(PATHS.forgotPassword);
  });

  it('missing token: immediate error with recovery link and no request', async () => {
    const { calls } = await mountApp(PATHS.resetPassword, { makeSession: realSession, handler: createAuthBackend().handler });
    expect($('[data-state="reset-invalid"]').textContent).toContain('Falta el enlace');
    expect(document.querySelector(`[data-state="reset-invalid"] a[href="${PATHS.forgotPassword}"]`)).not.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('never logs the token', async () => {
    const backend = createAuthBackend();
    const token = backend.issueReset();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(level => jest.spyOn(console, level).mockImplementation(() => undefined));
    await mountApp(`${PATHS.resetPassword}?token=${token}`, { makeSession: realSession, handler: backend.handler });
    setValue('#reset-password', 'una-clave-nueva-1');
    setValue('#reset-confirm', 'una-clave-nueva-1');
    await submit('#reset-form');
    expect(spies.flatMap(spy => spy.mock.calls.flat().map(String)).join('\n')).not.toContain(token);
    spies.forEach(spy => spy.mockRestore());
  });
});

describe('AUTH03-F03 /account/change-password', () => {
  async function openSignedIn() {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    const mounted = await mountApp(PATHS.changePassword, { makeSession: realSession, handler: backend.handler });
    return { backend, ...mounted };
  }
  const fill = (current: string, next: string, confirm: string) => {
    setValue('#current-password', current);
    setValue('#new-password', next);
    setValue('#confirm-password', confirm);
  };
  const posts = (calls: { method: string; url: string }[]) => calls.filter(c => pathOf(c as never) === 'POST /auth/change-password');

  it('requires authentication (no token → /login)', async () => {
    const { calls } = await mountApp(PATHS.changePassword, { makeSession: realSession, handler: createAuthBackend().handler });
    expect(window.location.pathname).toBe(PATHS.login);
    expect(new URLSearchParams(window.location.search).get('next')).toBe(PATHS.changePassword);
    expect(calls).toHaveLength(0);
  });

  it('validates the confirmation (and policy) before calling the API', async () => {
    const { calls } = await openSignedIn();
    fill(PASSWORD, 'nueva-clave-segura', 'otra-cosa-distinta');
    await submit('#change-password-form');
    expect($('#confirm-password-error').textContent).toBe('Las contraseñas no coinciden.');
    fill(PASSWORD, PASSWORD, PASSWORD);
    await submit('#change-password-form');
    expect($('#new-password-error').textContent).toBe('La nueva contraseña debe ser distinta de la actual.');
    fill('', 'nueva-clave-segura', 'nueva-clave-segura');
    await submit('#change-password-form');
    expect($('#current-password-error').textContent).toBe('Introduce tu contraseña actual.');
    expect(posts(calls)).toHaveLength(0);
  });

  it('wrong current password (API 400): field error, session kept, no redirect', async () => {
    const { calls } = await openSignedIn();
    fill('clave-incorrecta-1', 'nueva-clave-segura', 'nueva-clave-segura');
    await submit('#change-password-form');
    expect(posts(calls)).toHaveLength(1);
    expect($('#current-password-error').textContent).toBe('La contraseña actual no es correcta.');
    expect($('#change-status [role="alert"]').textContent).toBe('La contraseña actual no es correcta.');
    expect(window.location.pathname).toBe(PATHS.changePassword);
    expect(stored()).not.toBeNull();
  });

  it('success: Bearer POST with the exact body, success feedback, form cleared', async () => {
    const { calls, backend } = await openSignedIn();
    fill(PASSWORD, 'nueva-clave-segura', 'nueva-clave-segura');
    await submit('#change-password-form');
    const [post] = posts(calls) as never as { headers: Record<string, string>; body: unknown }[];
    expect(post.headers.Authorization).toBe(`Bearer ${backend.validToken}`);
    expect(post.body).toEqual({ current_password: PASSWORD, new_password: 'nueva-clave-segura' });
    expect($('#change-status [role="status"]').textContent).toContain('Contraseña actualizada correctamente');
    expect(($('#current-password') as HTMLInputElement).value).toBe('');
    expect(backend.users.get(EMAIL)!.password).toBe('nueva-clave-segura');
  });

  it('401 during the change clears the session and redirects (AUTH-02 behaviour preserved)', async () => {
    const { backend } = await openSignedIn();
    backend.revoke(backend.validToken);
    fill(PASSWORD, 'nueva-clave-segura', 'nueva-clave-segura');
    await submit('#change-password-form');
    await flush();
    expect(stored()).toBeNull();
    expect(window.location.pathname).toBe(PATHS.login);
  });
});

describe('AUTH03-F04 login and profile links', () => {
  it('the login page shows a visible "¿Olvidaste tu contraseña?" link that opens /forgot-password', async () => {
    await mountApp(PATHS.login, { makeSession: realSession, handler: createAuthBackend().handler });
    const link = $('#forgot-password-link') as HTMLAnchorElement;
    expect(link.textContent).toBe('¿Olvidaste tu contraseña?');
    expect(link.getAttribute('href')).toBe(PATHS.forgotPassword);
    expect(link.closest('[hidden]')).toBeNull();
    link.click();
    await flush();
    expect(window.location.pathname).toBe(PATHS.forgotPassword);
    expect(document.querySelector('#forgot-form')).not.toBeNull();
  });

  it('the profile page links to change-password', async () => {
    const backend = createAuthBackend();
    window.localStorage.setItem(KEY, backend.validToken);
    await mountApp(PATHS.profile, { makeSession: realSession, handler: backend.handler });
    $('#change-password-link').click();
    await flush();
    expect(window.location.pathname).toBe(PATHS.changePassword);
    expect(document.querySelector('#change-password-form')).not.toBeNull();
  });
});

describe('validateNewPassword', () => {
  it('mirrors the API policy and checks the confirmation', () => {
    expect(NexovaAuth.validateNewPassword('12345678', '12345678')).toEqual({});
    expect(NexovaAuth.validateNewPassword('', '')).toEqual({ new_password: 'Introduce la nueva contraseña.', confirm_password: 'Repite la nueva contraseña.' });
    expect(NexovaAuth.validateNewPassword('x'.repeat(129), 'x'.repeat(129)).new_password).toContain('entre 8 y 128');
    expect(NexovaAuth.validateNewPassword('abcdefgh', 'abcdefgX')).toEqual({ confirm_password: 'Las contraseñas no coinciden.' });
  });
});
