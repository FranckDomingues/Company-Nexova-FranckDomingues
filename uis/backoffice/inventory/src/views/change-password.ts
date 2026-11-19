import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';
import { ApiError } from '../lib/http.js';
import { banner, field, setFieldError } from './forms.js';
import { pageHeader } from './products.js';

const API_MESSAGES: Record<string, { field: 'current' | 'new'; message: string }> = {
  'Current password is incorrect': { field: 'current', message: 'La contraseña actual no es correcta.' },
  'New password must be different from the current password': { field: 'new', message: 'La nueva contraseña debe ser distinta de la actual.' },
};

/**
 * AUTH03-F03 — /backoffice/account/change-password (protected). Validates that the new password and its
 * confirmation match (and the 8–128 policy) before calling POST /auth/change-password with the Bearer
 * token through the shared client. 400 → field error on the current password; 401 → session flow.
 */
export function renderChangePassword(ctx: ViewContext): void {
  const current = field('current-password', 'Contraseña actual', h('input', { name: 'current_password', type: 'password', autocomplete: 'current-password', required: true, className: UI.input }));
  const next = field('new-password', 'Nueva contraseña', h('input', { name: 'new_password', type: 'password', autocomplete: 'new-password', required: true, minlength: '8', maxlength: '128', className: UI.input }),
    h('p', { id: 'new-password-hint', className: 'mt-1 text-xs text-slate-500' }, 'Entre 8 y 128 caracteres, distinta de la actual.'));
  const confirm = field('confirm-password', 'Repite la nueva contraseña', h('input', { name: 'confirm_password', type: 'password', autocomplete: 'new-password', required: true, className: UI.input }));
  const status = h('div', { id: 'change-status', 'aria-live': 'polite', className: 'mt-4' });
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Cambiar contraseña');
  const form = h('form', { id: 'change-password-form', className: 'mt-5 space-y-4', novalidate: true }, current.wrapper, next.wrapper, confirm.wrapper, submit);

  ctx.root.append(
    pageHeader('Cuenta', 'Cambiar contraseña', 'Por seguridad, confirma tu contraseña actual antes de elegir una nueva.'),
    h('section', { className: `mt-6 max-w-xl p-5 sm:p-7 ${UI.card}`, 'aria-labelledby': 'change-title' },
      h('h2', { id: 'change-title', className: 'text-xl font-semibold' }, 'Nueva contraseña'), status, form),
    h('p', { className: 'mt-4 text-sm' }, h('a', { href: PATHS.profile, 'data-link': true, className: 'font-medium text-sky-800 underline' }, '← Volver a mi perfil')));

  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    status.replaceChildren();
    const errors = ctx.auth.validateNewPassword(next.control.value, confirm.control.value);
    const currentError = current.control.value ? '' : 'Introduce tu contraseña actual.';
    const sameError = !errors.new_password && current.control.value && current.control.value === next.control.value
      ? 'La nueva contraseña debe ser distinta de la actual.' : '';
    setFieldError(current, currentError);
    setFieldError(next, errors.new_password ?? sameError);
    setFieldError(confirm, errors.confirm_password ?? '');
    const firstInvalid = [current, next, confirm].find(f => f.control.getAttribute('aria-invalid') === 'true');
    if (firstInvalid) { firstInvalid.control.focus(); return; }
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    form.setAttribute('aria-busy', 'true');
    try {
      await ctx.accountApi.changePassword(current.control.value, next.control.value);
      form.reset();
      status.replaceChildren(banner('success', 'Contraseña actualizada correctamente. Úsala la próxima vez que inicies sesión.'));
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) return; // shared client cleared the session and redirected
        const known = API_MESSAGES[error.message];
        if (known) setFieldError(known.field === 'current' ? current : next, known.message);
        if (error.fieldErrors.new_password) setFieldError(next, 'La contraseña debe tener entre 8 y 128 caracteres.');
        status.replaceChildren(banner('error', known ? known.message : `No se pudo cambiar la contraseña (HTTP ${error.status || 'sin conexión'}): ${error.message}`));
        if (known?.field === 'current') current.control.focus();
      } else {
        status.replaceChildren(banner('error', 'No se pudo cambiar la contraseña.'));
      }
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Cambiar contraseña';
      form.removeAttribute('aria-busy');
    }
  });
}
