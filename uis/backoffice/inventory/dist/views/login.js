import { safeNextPath } from '../app.js';
import { h, UI } from '../dom.js';
/** Login screen backed by the existing NexovaAuth session (POST /auth/login + GET /auth/me). */
export function renderLogin(ctx) {
    const error = h('p', { id: 'login-error', role: 'alert', className: 'text-sm font-medium text-rose-700' });
    const submit = h('button', { type: 'submit', className: UI.primary }, 'Entrar');
    const form = h('form', { id: 'login-form', className: 'mt-5 space-y-4', novalidate: true }, h('label', { className: UI.label }, 'Correo electrónico', h('input', { name: 'username', type: 'email', autocomplete: 'username', required: true, className: UI.input })), h('label', { className: UI.label }, 'Contraseña', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, className: UI.input })), error, submit);
    let submitting = false;
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitting)
            return;
        const data = new FormData(form);
        const username = String(data.get('username') ?? '');
        const password = String(data.get('password') ?? '');
        const invalid = ctx.auth.validateLoginInput(username, password);
        if (invalid) {
            error.textContent = invalid;
            return;
        }
        submitting = true;
        submit.disabled = true;
        submit.textContent = 'Entrando…';
        error.textContent = '';
        try {
            await ctx.session.login({ username, password });
            await ctx.navigate(safeNextPath(ctx.params.get('next')), { replace: true });
        }
        catch (cause) {
            error.textContent = cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.';
        }
        finally {
            submitting = false;
            submit.disabled = false;
            submit.textContent = 'Entrar';
        }
    });
    ctx.root.append(h('section', { id: 'login-gate', className: `mx-auto max-w-md p-6 ${UI.card}`, 'aria-labelledby': 'login-title' }, h('h1', { id: 'login-title', className: 'text-2xl font-bold' }, 'Iniciar sesión'), h('p', { className: 'mt-2 text-sm text-slate-600' }, 'Accede con tu cuenta Nexova para gestionar el inventario de activos.'), form));
}
