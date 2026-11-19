import { safeNextPath } from '../app.js';
import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';

/**
 * AUTH02-01 — /backoffice/login: POST /auth/login + GET /auth/me through NexovaAuth; the JWT is persisted
 * in localStorage by the session. A wrong password (HTTP 401 from the login endpoint) is shown here and
 * never triggers the session-expiry redirect.
 */
export function renderLogin(ctx: ViewContext): void {
  const error = h('p', { id: 'login-error', role: 'alert', className: 'text-sm font-medium text-rose-700' });
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Entrar');
  const form = h('form', { id: 'login-form', className: 'mt-5 space-y-4', novalidate: true, 'aria-describedby': 'login-error' },
    h('label', { className: UI.label }, 'Correo electrónico',
      h('input', { name: 'username', type: 'email', autocomplete: 'username', required: true, className: UI.input })),
    h('label', { className: UI.label }, 'Contraseña',
      h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, className: UI.input })),
    error,
    submit,
  );
  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(form);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    const invalid = ctx.auth.validateLoginInput(username, password);
    if (invalid) { error.textContent = invalid; return; }
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Entrando…';
    error.textContent = '';
    try {
      await ctx.session.login({ username, password });
      await ctx.goTo(safeNextPath(ctx.params.get('next')));
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.';
      (form.elements.namedItem('password') as HTMLInputElement | null)?.select();
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  });
  const reason = ctx.params.get('reason');
  const notice = reason === 'session'
    ? h('p', { role: 'alert', className: `mt-4 ${UI.error}`, dataset: { state: 'session-expired' } },
      'Tu sesión no es válida o ha caducado. La última operación no se completó: inicia sesión de nuevo y vuelve a intentarlo.')
    : reason === 'logout'
      ? h('p', { role: 'status', className: `mt-4 ${UI.success}`, dataset: { state: 'logged-out' } }, 'Has cerrado sesión correctamente.')
      : null;
  const next = ctx.params.get('next');
  const registerHref = next ? `${PATHS.register}?next=${encodeURIComponent(next)}` : PATHS.register;
  ctx.root.append(h('section', { id: 'login-gate', className: `mx-auto max-w-md p-6 ${UI.card}`, 'aria-labelledby': 'login-title' },
    h('h1', { id: 'login-title', className: 'text-2xl font-bold' }, 'Iniciar sesión'),
    notice,
    h('p', { className: 'mt-2 text-sm text-slate-600' }, 'Accede con tu cuenta Nexova al backoffice: inventario, proveedores y tu perfil.'),
    form,
    h('p', { className: 'mt-5 text-sm text-slate-600' }, '¿No tienes cuenta? ',
      h('a', { href: registerHref, 'data-link': true, className: 'font-medium text-sky-800 underline' }, 'Crear una cuenta')),
  ));
}
