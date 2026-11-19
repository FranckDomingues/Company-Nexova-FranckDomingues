import { PATHS, type View, type ViewContext } from './context.js';
import type { InventoryApi } from './lib/inventory.js';
import type { AuthSession, NexovaAuthModule } from './lib/session.js';
import { renderHistory } from './views/history.js';
import { renderInbound } from './views/inbound.js';
import { renderLogin } from './views/login.js';
import { renderOutbound } from './views/outbound.js';
import { renderProducts } from './views/products.js';

interface Route { view: View; title: string }

/** All four inventory routes are protected; only the login route is public. */
export const PROTECTED_ROUTES: Record<string, Route> = {
  [PATHS.products]: { view: renderProducts, title: 'Activos' },
  [PATHS.inbound]: { view: renderInbound, title: 'Entrada de activos' },
  [PATHS.outbound]: { view: renderOutbound, title: 'Salida de activos' },
  [PATHS.orders]: { view: renderHistory, title: 'Historial de órdenes' },
};

/** Only same-app inventory paths are accepted as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/backoffice/inventory/') || next.startsWith('//')) return PATHS.products;
  return next;
}

export interface AppDeps {
  root: HTMLElement;
  win: Window;
  session: AuthSession;
  auth: NexovaAuthModule;
  api: InventoryApi;
  /** Optional header elements managed by the shell. */
  nav?: HTMLElement | null;
  account?: HTMLElement | null;
}

export function createApp(deps: AppDeps) {
  const { root, win, session } = deps;
  let renderSeq = 0;

  const currentPath = () => win.location.pathname.replace(/\/+$/, '') || '/';

  async function navigate(to: string, options: { replace?: boolean } = {}): Promise<void> {
    win.history[options.replace ? 'replaceState' : 'pushState']({}, '', to);
    await render();
  }

  /**
   * Route through the existing login flow, remembering where the user was going.
   * `reason: 'session'` (API 401 during use) makes the login page say the last operation was not completed.
   */
  function redirectToLogin(reason?: 'session'): Promise<void> {
    if (currentPath() === PATHS.login) return Promise.resolve();
    const next = `${win.location.pathname}${win.location.search}`;
    session.logout();
    return navigate(`${PATHS.login}?next=${encodeURIComponent(next)}${reason ? `&reason=${reason}` : ''}`, { replace: true });
  }

  function updateChrome(path: string, authenticated: boolean): void {
    if (deps.nav) {
      deps.nav.hidden = !authenticated;
      deps.nav.querySelectorAll<HTMLAnchorElement>('a[data-link]').forEach(link => {
        const active = link.getAttribute('href') === path;
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
    }
    if (deps.account) {
      deps.account.hidden = !authenticated;
      const email = deps.account.querySelector('[data-account-email]');
      if (email) email.textContent = session.account?.email ?? '';
    }
  }

  async function render(): Promise<void> {
    const seq = ++renderSeq;
    const path = currentPath();
    const params = new URLSearchParams(win.location.search);
    const authenticated = session.getAuthorizationHeader() !== null;

    if (path === PATHS.login) {
      if (authenticated) return navigate(safeNextPath(params.get('next')), { replace: true });
      updateChrome(path, false);
      root.replaceChildren();
      win.document.title = 'Iniciar sesión · Nexova Backoffice';
      return renderLogin(context(params));
    }

    const route = PROTECTED_ROUTES[path];
    if (!route) return navigate(PATHS.products, { replace: true });
    if (!authenticated) {
      // Never render or fetch protected data without a valid session.
      root.replaceChildren();
      updateChrome(path, false);
      return redirectToLogin();
    }
    updateChrome(path, true);
    root.replaceChildren();
    win.document.title = `${route.title} · Inventario · Nexova Backoffice`;
    if (seq === renderSeq) await route.view(context(params));
  }

  function context(params: URLSearchParams): ViewContext {
    return { root, api: deps.api, session, auth: deps.auth, params, navigate };
  }

  function onClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const link = target?.closest?.('a[data-link]') as HTMLAnchorElement | null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
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
    start(): Promise<void> {
      win.addEventListener('popstate', onPopState);
      win.document.addEventListener('click', onClick);
      deps.account?.querySelector('[data-logout]')?.addEventListener('click', onLogout);
      return render();
    },
    stop(): void {
      win.removeEventListener('popstate', onPopState);
      win.document.removeEventListener('click', onClick);
      deps.account?.querySelector('[data-logout]')?.removeEventListener('click', onLogout);
    },
  };
}
