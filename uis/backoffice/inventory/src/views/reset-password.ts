import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';
import { isAuthError } from '../lib/session.js';
import { field, setFieldError } from './forms.js';

/**
 * AUTH03-F02 — /backoffice/reset-password?token=…
 * Reads the token once from the query string, then removes it from the address bar (history.replaceState)
 * so it does not linger in history, screenshots or later Referer headers. The token is only kept in this
 * closure and sent in the POST body; it is never rendered, logged or put in another URL.
 * Success → session cleared → /backoffice/login?reason=password-reset. Invalid/expired/used → clear error
 * with a link to request a new email.
 */
export function renderResetPassword(ctx: ViewContext): void {
  const token = ctx.params.get('token') ?? '';
  if (ctx.params.has('token')) {
    const rest = new URLSearchParams(ctx.params);
    rest.delete('token');
    const query = rest.toString();
    window.history.replaceState(window.history.state, '', `${PATHS.resetPassword}${query ? `?${query}` : ''}`);
  }

  const status = h('div', { id: 'reset-status', 'aria-live': 'polite', className: 'mt-4' });
  const invalidLink = (message: string) => h('div', { role: 'alert', className: UI.error, dataset: { state: 'reset-invalid' } },
    h('p', {}, message),
    h('p', { className: 'mt-2' }, h('a', { href: PATHS.forgotPassword, 'data-link': true, className: 'font-semibold underline' }, 'Solicitar un nuevo enlace')));

  const section = h('section', { id: 'reset-gate', className: `mx-auto max-w-md p-6 ${UI.card}`, 'aria-labelledby': 'reset-title' },
    h('h1', { id: 'reset-title', className: 'text-2xl font-bold' }, 'Elige una nueva contraseña'),
    status);
  ctx.root.append(section);

  if (!token) {
    status.replaceChildren(invalidLink('Falta el enlace de restablecimiento o está incompleto. Abre el enlace completo del correo o solicita uno nuevo.'));
    return;
  }

  const password = field('reset-password', 'Nueva contraseña', h('input', { name: 'new_password', type: 'password', autocomplete: 'new-password', required: true, minlength: '8', maxlength: '128', className: UI.input }),
    h('p', { id: 'reset-password-hint', className: 'mt-1 text-xs text-slate-500' }, 'Entre 8 y 128 caracteres.'));
  const confirm = field('reset-confirm', 'Repite la nueva contraseña', h('input', { name: 'confirm_password', type: 'password', autocomplete: 'new-password', required: true, className: UI.input }));
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Guardar nueva contraseña');
  const form = h('form', { id: 'reset-form', className: 'mt-5 space-y-4', novalidate: true }, password.wrapper, confirm.wrapper, submit);
  section.append(form);

  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    status.replaceChildren();
    const errors = ctx.auth.validateNewPassword(password.control.value, confirm.control.value);
    setFieldError(password, errors.new_password ?? '');
    setFieldError(confirm, errors.confirm_password ?? '');
    if (Object.keys(errors).length) { (errors.new_password ? password : confirm).control.focus(); return; }
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    form.setAttribute('aria-busy', 'true');
    try {
      await ctx.session.resetPassword(token, password.control.value);
      ctx.session.logout(); // any old session on this browser belongs to the previous password
      await ctx.navigate(`${PATHS.login}?reason=password-reset`, { replace: true });
      return;
    } catch (error) {
      if (isAuthError(error) && error.code === 'INVALID_RESET_TOKEN') {
        form.remove();
        status.replaceChildren(invalidLink(error.message));
        return;
      }
      if (isAuthError(error) && error.fieldErrors.new_password) setFieldError(password, error.fieldErrors.new_password);
      status.replaceChildren(h('p', { role: 'alert', className: UI.error }, error instanceof Error ? error.message : 'No se pudo restablecer la contraseña.'));
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Guardar nueva contraseña';
      form.removeAttribute('aria-busy');
    }
  });
}
