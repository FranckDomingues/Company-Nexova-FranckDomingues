import { PATHS } from './context.js';
import { renderHistory } from './views/history.js';
import { renderInbound } from './views/inbound.js';
import { renderLogin } from './views/login.js';
import { renderOutbound } from './views/outbound.js';
import { renderProducts } from './views/products.js';
/** All four inventory routes are protected; only the login route is public. */
export const PROTECTED_ROUTES = {
    [PATHS.products]: { view: renderProducts, title: 'Activos' },
    [PATHS.inbound]: { view: renderInbound, title: 'Entrada de activos' },
    [PATHS.outbound]: { view: renderOutbound, title: 'Salida de activos' },
    [PATHS.orders]: { view: renderHistory, title: 'Historial de órdenes' },
};
/** Only same-app inventory paths are accepted as post-login destinations (no open redirects). */
export function safeNextPath(next) {
    if (!next || !next.startsWith('/backoffice/inventory/') || next.startsWith('//'))
        return PATHS.products;
    return next;
}
export function createApp(deps) {
    const { root, win, session } = deps;
    let renderSeq = 0;
    const currentPath = () => win.location.pathname.replace(/\/+$/, '') || '/';
    async function navigate(to, options = {}) {
        win.history[options.replace ? 'replaceState' : 'pushState']({}, '', to);
        await render();
    }
    /**
     * Route through the existing login flow, remembering where the user was going.
     * `reason: 'session'` (API 401 during use) makes the login page say the last operation was not completed.
     */
    function redirectToLogin(reason) {
        if (currentPath() === PATHS.login)
            return Promise.resolve();
        const next = `${win.location.pathname}${win.location.search}`;
        session.logout();
        return navigate(`${PATHS.login}?next=${encodeURIComponent(next)}${reason ? `&reason=${reason}` : ''}`, { replace: true });
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
                email.textContent = session.account?.email ?? '';
        }
    }
    async function render() {
        const seq = ++renderSeq;
        const path = currentPath();
        const params = new URLSearchParams(win.location.search);
        const authenticated = session.getAuthorizationHeader() !== null;
        if (path === PATHS.login) {
            if (authenticated)
                return navigate(safeNextPath(params.get('next')), { replace: true });
            updateChrome(path, false);
            root.replaceChildren();
            win.document.title = 'Iniciar sesión · Nexova Backoffice';
            return renderLogin(context(params));
        }
        const route = PROTECTED_ROUTES[path];
        if (!route)
            return navigate(PATHS.products, { replace: true });
        if (!authenticated) {
            // Never render or fetch protected data without a valid session.
            root.replaceChildren();
            updateChrome(path, false);
            return redirectToLogin();
        }
        updateChrome(path, true);
        root.replaceChildren();
        win.document.title = `${route.title} · Inventario · Nexova Backoffice`;
        if (seq === renderSeq)
            await route.view(context(params));
    }
    function context(params) {
        return { root, api: deps.api, session, auth: deps.auth, params, navigate };
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
    const onLogout = () => {
        session.logout();
        void navigate(PATHS.login, { replace: true });
    };
    return {
        navigate,
        redirectToLogin,
        render,
        start() {
            win.addEventListener('popstate', onPopState);
            win.document.addEventListener('click', onClick);
            deps.account?.querySelector('[data-logout]')?.addEventListener('click', onLogout);
            return render();
        },
        stop() {
            win.removeEventListener('popstate', onPopState);
            win.document.removeEventListener('click', onClick);
            deps.account?.querySelector('[data-logout]')?.removeEventListener('click', onLogout);
        },
    };
}
