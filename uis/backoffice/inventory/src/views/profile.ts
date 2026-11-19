import { PATHS, type ViewContext } from '../context.js';
import { h, UI } from '../dom.js';
import { ApiError } from '../lib/http.js';
import type { AuthAccount } from '../lib/session.js';
import { banner, field, setFieldError, type Field } from './forms.js';
import { pageHeader } from './products.js';

type ProfileField = 'name' | 'phone' | 'address';
const LABELS: Record<ProfileField, string> = { name: 'Nombre', phone: 'Teléfono', address: 'Dirección' };

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const orNull = (value: string): string | null => value.trim() || null;

/**
 * AUTH02-03 — /backoffice/account/profile. Reads the account and linked profile with GET /auth/me
 * (NexovaAuth verify, forced) and updates name/phone/address with PUT /profiles/me through the shared
 * Bearer client. A 401 on either call clears the session and routes to login.
 */
export async function renderProfile(ctx: ViewContext): Promise<void> {
  const loading = h('p', { id: 'profile-loading', role: 'status', className: 'mt-6 text-slate-600' }, 'Cargando tu perfil…');
  ctx.root.append(pageHeader('Cuenta', 'Mi perfil', 'Datos de tu cuenta Nexova. Puedes actualizar tu nombre, teléfono y dirección.'), loading);

  let account: AuthAccount | null;
  try {
    account = await ctx.session.verify({ force: true });
  } catch (error) {
    loading.replaceWith(banner('error', `No se pudo cargar tu perfil: ${(error as Error).message}`));
    return;
  }
  if (!account) {
    await ctx.redirectToLogin('session');
    return;
  }

  const profile = account.profile ?? {};
  const summaryValues: Record<ProfileField, HTMLElement> = {
    name: h('dd', { className: 'mt-1 text-slate-900', dataset: { profileValue: 'name' } }),
    phone: h('dd', { className: 'mt-1 text-slate-900', dataset: { profileValue: 'phone' } }),
    address: h('dd', { className: 'mt-1 whitespace-pre-line text-slate-900', dataset: { profileValue: 'address' } }),
  };
  const showSummary = (values: Record<ProfileField, unknown>) => {
    for (const key of Object.keys(summaryValues) as ProfileField[]) summaryValues[key].textContent = text(values[key]) || '—';
  };
  showSummary({ name: profile.name, phone: profile.phone, address: profile.address });

  const summary = h('section', { id: 'profile-summary', className: `mt-6 p-5 sm:p-7 ${UI.card}`, 'aria-labelledby': 'profile-summary-title' },
    h('h2', { id: 'profile-summary-title', className: 'text-xl font-semibold' }, 'Datos de la cuenta'),
    h('dl', { className: 'mt-4 grid gap-4 sm:grid-cols-2' },
      h('div', {}, h('dt', { className: 'text-sm font-medium text-slate-500' }, 'Correo electrónico'),
        h('dd', { className: 'mt-1 text-slate-900', dataset: { profileValue: 'email' } }, account.email)),
      h('div', {}, h('dt', { className: 'text-sm font-medium text-slate-500' }, 'Rol'),
        h('dd', { className: 'mt-1 text-slate-900', dataset: { profileValue: 'role' } }, account.role)),
      ...(Object.keys(summaryValues) as ProfileField[]).map(key =>
        h('div', {}, h('dt', { className: 'text-sm font-medium text-slate-500' }, LABELS[key]), summaryValues[key]))));

  const fields: Record<ProfileField, Field<HTMLInputElement | HTMLTextAreaElement>> = {
    name: field('profile-name', LABELS.name, h('input', { name: 'name', type: 'text', autocomplete: 'name', maxlength: '200', className: UI.input }), null, false),
    phone: field('profile-phone', LABELS.phone, h('input', { name: 'phone', type: 'tel', autocomplete: 'tel', maxlength: '50', className: UI.input }), null, false),
    address: field('profile-address', LABELS.address, h('textarea', { name: 'address', rows: '2', autocomplete: 'street-address', maxlength: '500', className: `${UI.input} py-2` }), null, false),
  };
  for (const key of Object.keys(fields) as ProfileField[]) fields[key].control.value = text(profile[key]);

  const status = h('div', { id: 'profile-status', 'aria-live': 'polite', className: 'mt-4' });
  const submit = h('button', { type: 'submit', className: UI.primary }, 'Guardar cambios');
  const form = h('form', { id: 'profile-form', className: 'mt-5 grid gap-4 sm:grid-cols-2', novalidate: true },
    fields.name.wrapper, fields.phone.wrapper,
    h('div', { className: 'sm:col-span-2' }, fields.address.wrapper),
    h('p', { className: 'text-xs text-slate-500 sm:col-span-2' }, 'Deja un campo vacío para borrarlo. El correo y el rol no se modifican desde aquí.'),
    h('div', { className: 'sm:col-span-2' }, submit));

  summary.append(h('p', { className: 'mt-5 text-sm' },
    h('a', { id: 'change-password-link', href: PATHS.changePassword, 'data-link': true, className: 'font-medium text-sky-800 underline' }, 'Cambiar contraseña')));
  loading.replaceWith(summary,
    h('section', { className: `mt-6 p-5 sm:p-7 ${UI.card}`, 'aria-labelledby': 'profile-form-title' },
      h('h2', { id: 'profile-form-title', className: 'text-xl font-semibold' }, 'Editar perfil'), status, form));

  let submitting = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    status.replaceChildren();
    const update = { name: orNull(fields.name.control.value), phone: orNull(fields.phone.control.value), address: orNull(fields.address.control.value) };
    const errors = ctx.auth.validateProfileFields(update);
    for (const key of Object.keys(fields) as ProfileField[]) setFieldError(fields[key], errors[key] ?? '');
    if (Object.keys(errors).length) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Guardando…';
    form.setAttribute('aria-busy', 'true');
    try {
      const saved = await ctx.accountApi.updateProfile(update);
      showSummary(saved);
      for (const key of Object.keys(fields) as ProfileField[]) fields[key].control.value = text(saved[key]);
      status.replaceChildren(banner('success', 'Perfil actualizado correctamente.'));
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) return; // session cleared and redirected by the shared client
        for (const key of Object.keys(fields) as ProfileField[]) {
          if (error.fieldErrors[key]) setFieldError(fields[key], error.fieldErrors[key]);
        }
        status.replaceChildren(banner('error', `No se pudo guardar el perfil (HTTP ${error.status || 'sin conexión'}): ${error.message}`));
      } else {
        status.replaceChildren(banner('error', 'No se pudo guardar el perfil.'));
      }
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Guardar cambios';
      form.removeAttribute('aria-busy');
    }
  });
}
