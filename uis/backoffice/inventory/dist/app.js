import { PATHS } from './context.js';
import { h, UI } from './dom.js';
import { renderHistory } from './views/history.js';
import { renderInbound } from './views/inbound.js';
import { renderLogin } from './views/login.js';
import { renderOutbound } from './views/outbound.js';
import { renderProducts } from './views/products.js';
import { renderChangePassword } from './views/change-password.js';
import { renderForgotPassword } from './views/forgot-password.js';
import { renderProfile } from './views/profile.js';
import { renderRegister } from './views/register.js';
import { renderResetPassword } from './views/reset-password.js';
/** Private views: require a token that GET /auth/me has accepted during this page load (AUTH02-05). */
export const PROTECTED_ROUTES = {
    [PATHS.products]: { view: renderProducts, title: 'Activos · Inventario' },
    [PATHS.inbound]: { view: renderInbound, title: 'Entrada de activos · Inventario' },
    [PATHS.outbound]: { view: renderOutbound, title: 'Salida de activos · Inventario' },
    [PATHS.orders]: { view: renderHistory, title: 'Historial de órdenes · Inventario' },
    [PATHS.profile]: { view: renderProfile, title: 'Mi perfil' },
    [PATHS.changePassword]: { view: renderChangePassword, title: 'Cambiar contraseña' },
};
/** Guest-only views: an already valid session is sent on to its destination instead. */
export const GUEST_ROUTES = {
    [PATHS.login]: { view: renderLogin, title: 'Iniciar sesión' },
    [PATHS.register]: { view: renderRegister, title: 'Crear cuenta' },
};
/**
 * AUTH-03 public views: reachable with or without a session (a signed-in user may open a reset link),
 * never verified, never showing private chrome.
 */
export const PUBLIC_ROUTES = {
    [PATHS.forgotPassword]: { view: renderForgotPassword, title: 'Recuperar contraseña' },
    [PATHS.resetPassword]: { view: renderResetPassword, title: 'Restablecer contraseña' },
};
/**
 * Post-login destinations are restricted to private backoffice pages on this origin (no open redirects):
 * the SPA's protected routes and the supplier directory page.
 */
export function safeNextPath(next) {
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\'))
        return PATHS.products;
    const pathname = next.split(/[?#]/)[0];
    if (pathname.startsWith('/backoffice/inventory/') || pathname === PATHS.profile || pathname === PATHS.changePassword ||
        pathname === PATHS.suppliers || pathname === '/backoffice/index.html')
        return next;
    return PATHS.products;
}
export function createApp(deps) {
    const { root, win, session } = deps;
    const assign = deps.assign ?? ((url) => win.location.assign(url));
    let renderSeq = 0;
    const currentPath = () => win.location.pathname.replace(/\/+$/, '') || '/';
    async function navigate(to, options = {}) {
        win.history[options.replace ? 'replaceState' : 'pushState']({}, '', to);
        await render();
    }
    async function goTo(to) {
        const pathname = to.split(/[?#]/)[0].replace(/\/+$/, '');
        if (PROTECTED_ROUTES[pathname])
            return navigate(to, { replace: true });
        assign(to);
    }
    /**
     * Clear the session (memory + localStorage) and route to login, remembering where the user was going.
     * No-op on the login page itself, so a failing login can never loop.
     */
    function redirectToLogin(reason) {
        if (currentPath() === PATHS.login)
            return Promise.resolve();
        const next = `${win.location.pathname}${win.location.search}`;
        session.logout();
        return navigate(`${PATHS.login}?next=${encodeURIComponent(next)}${reason ? `&reason=${reason}` : ''}`, { replace: true });
    }
    /**
     * AUTH02-10: an authenticated request got HTTP 401 → invalidate the session and go to login.
     * Ignored when the rejected token is no longer the current one (a newer login already replaced it).
     */
    function handleUnauthorized(rejectedAuthorization = null) {
        const current = session.getAuthorizationHeader();
        if (rejectedAuthorization && current && rejectedAuthorization !== current)
            return Promise.resolve();
        return redirectToLogin('session');
    }
    function updateChrome(path, authenticated) {
        if (deps.nav) {
            deps.nav.hidden = !authenticated;
            deps.nav.querySelectorAll('a[data-link]').forEach(link => {
                const active = link.getAttribute('href') === path;
                if (active)
                    link.setAttribute('aria-current', 'page');
                else
                    link.removeAttribute('aria-current');
            });
        }
        if (deps.account) {
            deps.account.hidden = !authenticated;
            const email = deps.account.querySelector('[data-account-email]');
            if (email)
                email.textContent = authenticated ? session.account?.email ?? '' : '';
        }
    }
    /** Ask the API whether the stored token is valid. 401 → invalid (token removed); anything else is an error. */
    async function verifySession() {
        try {
            return (await session.verify()) ? { state: 'valid' } : { state: 'invalid' };
        }
        catch (error) {
            return { state: 'error', message: error instanceof Error ? error.message : 'Error desconocido.' };
        }
    }
    /** Neutral placeholder shown while the session is checked: no protected markup, nav or account data. */
    function showVerifying() {
        root.replaceChildren(h('div', { id: 'session-check', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true', className: 'py-16 text-center text-slate-600' }, 'Verificando tu sesión…'));
        win.document.title = 'Verificando sesión · Nexova Backoffice';
    }
    function showVerifyError(message) {
        const retry = h('button', { type: 'button', className: UI.primary }, 'Reintentar');
        retry.addEventListener('click', () => { void render(); });
        const signOut = h('button', { type: 'button', className: 'ml-3 min-h-11 rounded-md border border-slate-300 px-4 font-medium hover:bg-slate-50' }, 'Cerrar sesión');
        signOut.addEventListener('click', onLogout);
        root.replaceChildren(h('section', { id: 'session-error', className: `mx-auto max-w-lg p-6 ${UI.card}` }, h('h1', { className: 'text-xl font-semibold' }, 'No se pudo verificar tu sesión'), h('p', { role: 'alert', className: `mt-3 ${UI.error}` }, message), h('div', { className: 'mt-5' }, retry, signOut)));
        win.document.title = 'Sesión no verificada · Nexova Backoffice';
    }
    async function render() {
        const seq = ++renderSeq;
        const path = currentPath();
        const params = new URLSearchParams(win.location.search);
        const open = PUBLIC_ROUTES[path];
        if (open) {
            updateChrome(path, false);
            root.replaceChildren();
            win.document.title = `${open.title} · Nexova Backoffice`;
            return open.view(context(params));
        }
        const guest = GUEST_ROUTES[path];
        if (guest) {
            updateChrome(path, false);
            if (session.getAuthorizationHeader()) {
                // A stored token must be confirmed before skipping login; a rejected one is cleared (no loop).
                showVerifying();
                const result = await verifySession();
                if (seq !== renderSeq)
                    return;
                if (result.state === 'valid')
                    return goTo(safeNextPath(params.get('next')));
            }
            root.replaceChildren();
            win.document.title = `${guest.title} · Nexova Backoffice`;
            return guest.view(context(params));
        }
        const route = PROTECTED_ROUTES[path];
        if (!route)
            return navigate(PATHS.products, { replace: true });
        if (!session.getAuthorizationHeader()) {
            // Never render or fetch protected data without a token.
            root.replaceChildren();
            updateChrome(path, false);
            return redirectToLogin();
        }
        if (!session.isVerified()) {
            updateChrome(path, false);
            showVerifying();
            const result = await verifySession();
            if (seq !== renderSeq)
                return;
            if (result.state === 'invalid')
                return redirectToLogin('session');
            if (result.state === 'error')
                return showVerifyError(result.message);
        }
        updateChrome(path, true);
        root.replaceChildren();
        win.document.title = `${route.title} · Nexova Backoffice`;
        if (seq === renderSeq)
            await route.view(context(params));
    }
    function context(params) {
        return { root, api: deps.api, accountApi: deps.accountApi, session, auth: deps.auth, params, navigate, goTo, redirectToLogin };
    }
    function onClick(event) {
        const target = event.target;
        const link = target?.closest?.('a[data-link]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
            return;
        event.preventDefault();
        void navigate(link.getAttribute('href') ?? PATHS.products);
    }
    const onPopState = () => { void render(); };
    /** Another tab logged in or out: re-run the guard against the new storage state. */
    const onStorage = (event) => {
        if (event.key === null || event.key === deps.auth.TOKEN_STORAGE_KEY)
            void render();
    };
    function onLogout() {
        session.logout();
        void navigate(`${PATHS.login}?reason=logout`, { replace: true });
    }
    return {
        navigate,
        redirectToLogin,
        handleUnauthorized,
        render,
        start() {
            win.addEventListener('popstate', onPopState);
            win.addEventListener('storage', onStorage);
            win.document.addEventListener('click', onClick);
            deps.account?.querySelector('[data-logout]')?.addEventListener('click', onLogout);
            return render();
        },
        stop() {
            win.removeEventListener('popstate', onPopState);
            win.removeEventListener('storage', onStorage);
            win.document.removeEventListener('click', onClick);
            deps.account?.querySelector('[data-logout]')?.removeEventListener('click', onLogout);
        },
    };
}
