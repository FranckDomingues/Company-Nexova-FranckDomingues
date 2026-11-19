import { safeNextPath } from '../app.js';
import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';
import { isAuthError } from '../lib/session.js';
import { banner, field, setFieldError, type Field } from './forms.js';

type FieldName = 'email' | 'password' | 'name' | 'phone' | 'address';

/**
 * AUTH02-02 — /backoffice/register. Matches services/api `UserRegistration` exactly:
 * required email + password (8–128); optional profile fields name (≤200), phone (≤50), address (≤500).
 * NexovaAuth.register() calls POST /users and then POST /auth/login with the same credentials, persisting
 * the JWT. Client checks mirror the API; API 409/422 errors are shown beside the offending field.
 */
export function renderRegister(ctx: ViewContext): void {
  const fields: Record<FieldName, Field<HTMLInputElement | HTMLTextAreaElement>> = {
    email: field('reg-email', 'Correo electrónico', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true, className: UI.input })),
    password: field('reg-password', 'Contraseña', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: '8', maxlength: '128', className: UI.input }),
      h('p', { id: 'reg-password-hint', className: 'mt-1 text-xs text-slate-500' }, 'Entre 8 y 128 caracteres.')),
    name: field('reg-name', 'Nombre', h('input', { name: 'name', type: 'text', autocomplete: 'name', maxlength: '200', className: UI.input }), null, false),
    phone: field('reg-phone', 'Teléfono', h('input', { name: 'phone', type: 'tel', autocomplete: 'tel', maxlength: '50', className: UI.input }), null, false),
    address: field('reg-address', 'Dirección', h('textarea', { name: 'address', rows: '2', autocomplete: 'street-address', maxlength: '500', className: `${UI.input} py-2` }), null, false),
  };
  const status = h('div', { id: 'register-status', 'aria-live': 'polite', className: 'mt-4' });
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Crear cuenta');
  const form = h('form', { id: 'register-form', className: 'mt-5 grid gap-4 sm:grid-cols-2', novalidate: true },
    h('div', { className: 'sm:col-span-2' }, fields.email.wrapper),
    h('div', { className: 'sm:col-span-2' }, fields.password.wrapper),
    fields.name.wrapper, fields.phone.wrapper,
    h('div', { className: 'sm:col-span-2' }, fields.address.wrapper),
    h('div', { className: 'sm:col-span-2' }, submit));

  const values = () => {
    const data = new FormData(form);
    const text = (key: FieldName) => String(data.get(key) ?? '');
    return { email: text('email').trim(), password: text('password'), name: text('name'), phone: text('phone'), address: text('address') };
  };
  const showErrors = (errors: Record<string, string>) => {
    for (const key of Object.keys(fields) as FieldName[]) setFieldError(fields[key], errors[key] ?? '');
    const first = (Object.keys(fields) as FieldName[]).find(key => errors[key]);
    if (first) fields[first].control.focus();
  };

  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    status.replaceChildren();
    const input = values();
    const errors = ctx.auth.validateRegistrationInput(input);
    showErrors(errors);
    if (Object.keys(errors).length) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Creando cuenta…';
    form.setAttribute('aria-busy', 'true');
    try {
      await ctx.session.register(input);
      await ctx.goTo(safeNextPath(ctx.params.get('next')));
    } catch (error) {
      if (isAuthError(error)) {
        showErrors(error.fieldErrors);
        status.replaceChildren(banner('error', error.message));
        if (error.code === 'REGISTERED_LOGIN_FAILED') {
          status.append(h('p', { className: 'mt-2 text-sm' }, h('a', { href: PATHS.login, 'data-link': true, className: 'font-medium text-sky-800 underline' }, 'Ir a iniciar sesión')));
        }
      } else {
        status.replaceChildren(banner('error', 'No se pudo crear la cuenta.'));
      }
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Crear cuenta';
      form.removeAttribute('aria-busy');
    }
  });

  const next = ctx.params.get('next');
  ctx.root.append(h('section', { id: 'register-gate', className: `mx-auto max-w-xl p-6 ${UI.card}`, 'aria-labelledby': 'register-title' },
    h('h1', { id: 'register-title', className: 'text-2xl font-bold' }, 'Crear cuenta'),
    h('p', { className: 'mt-2 text-sm text-slate-600' }, 'Regístrate para acceder al backoffice de Nexova. Iniciarás sesión automáticamente al terminar.'),
    status,
    form,
    h('p', { className: 'mt-5 text-sm text-slate-600' }, '¿Ya tienes cuenta? ',
      h('a', { href: next ? `${PATHS.login}?next=${encodeURIComponent(next)}` : PATHS.login, 'data-link': true, className: 'font-medium text-sky-800 underline' }, 'Inicia sesión')),
  ));
}
