import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';
import { isAuthError } from '../lib/session.js';
import { banner, field, setFieldError } from './forms.js';

export const FORGOT_CONFIRMATION = 'Si esa dirección está registrada, recibirás un enlace en breve para restablecer tu contraseña. Revisa también la carpeta de spam.';

/**
 * AUTH03-F01 — /backoffice/forgot-password. Calls POST /auth/forgot-password and always shows the same
 * confirmation (no account enumeration). After a successful submission the form stays disabled so the
 * request cannot be repeated by accident; network/rate-limit errors re-enable it.
 */
export function renderForgotPassword(ctx: ViewContext): void {
  const email = field('forgot-email', 'Correo electrónico', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, className: UI.input }));
  const status = h('div', { id: 'forgot-status', 'aria-live': 'polite', className: 'mt-4' });
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Enviar enlace');
  const form = h('form', { id: 'forgot-form', className: 'mt-5 space-y-4', novalidate: true }, email.wrapper, submit);
  let state: 'idle' | 'sending' | 'sent' = 'idle';

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (state !== 'idle') return; // duplicate-submission guard
    status.replaceChildren();
    const value = email.control.value.trim();
    const invalid = ctx.auth.validateLoginInput(value, 'x'); // reuses the shared email rule
    setFieldError(email, invalid ?? '');
    if (invalid) { email.control.focus(); return; }
    state = 'sending';
    submit.disabled = true;
    email.control.disabled = true;
    submit.textContent = 'Enviando…';
    form.setAttribute('aria-busy', 'true');
    try {
      await ctx.session.requestPasswordReset(value);
      state = 'sent';
      submit.textContent = 'Enlace solicitado';
      status.replaceChildren(h('div', { role: 'status', className: UI.success, dataset: { state: 'forgot-sent' } }, FORGOT_CONFIRMATION));
    } catch (error) {
      state = 'idle';
      submit.disabled = false;
      email.control.disabled = false;
      submit.textContent = 'Enviar enlace';
      if (isAuthError(error) && error.fieldErrors.email) setFieldError(email, error.fieldErrors.email);
      status.replaceChildren(banner('error', error instanceof Error ? error.message : 'No se pudo enviar la solicitud.'));
    } finally {
      form.removeAttribute('aria-busy');
    }
  });

  ctx.root.append(h('section', { id: 'forgot-gate', className: `mx-auto max-w-md p-6 ${UI.card}`, 'aria-labelledby': 'forgot-title' },
    h('h1', { id: 'forgot-title', className: 'text-2xl font-bold' }, '¿Olvidaste tu contraseña?'),
    h('p', { className: 'mt-2 text-sm text-slate-600' }, 'Escribe el correo de tu cuenta Nexova y te enviaremos un enlace para elegir una nueva contraseña.'),
    status,
    form,
    h('p', { className: 'mt-5 text-sm text-slate-600' },
      h('a', { href: PATHS.login, 'data-link': true, className: 'font-medium text-sky-800 underline' }, '← Volver a iniciar sesión')),
  ));
}
