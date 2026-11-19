import { NexovaAuth } from '../../suppliers/src/auth-session';
import { createApp } from '../src/app';
import { createAccountApi } from '../src/lib/account';
import type { ApiClientOptions } from '../src/lib/http';
import { createInventoryApi, type Asset, type InventoryOrder } from '../src/lib/inventory';
import type { AuthSession, NexovaAuthModule } from '../src/lib/session';

export const TOKEN = 'header.payload.signature';

export const ASSETS: Asset[] = [
  { id: 1, name: 'Portátil 14" Business', sku: 'NXV-IT-001', category: 'hardware', office: 'Valencia', current_stock: 12 },
  { id: 3, name: 'Ratón ergonómico', sku: 'NXV-PER-001', category: 'peripherals', office: 'Valencia', current_stock: 4 },
  { id: 5, name: 'Resma de papel A4', sku: 'NXV-OFF-001', category: 'office_supplies', office: 'Valencia', current_stock: 0 },
];

export const ORDERS: InventoryOrder[] = [
  { kind: 'inbound', id: 17, asset_id: 1, asset_name: 'Portátil 14" Business', asset_sku: 'NXV-IT-001', quantity: 10, office: 'Valencia', created_at: '2026-11-18T10:00:00+00:00', user_uuid: 'aaaaaaaa-1111-4000-8000-000000000001', supplier: 'TechDistrib Valencia S.L.', exit_type: null, assigned_to: null },
  { kind: 'outbound', id: 10, asset_id: 1, asset_name: 'Portátil 14" Business', asset_sku: 'NXV-IT-001', quantity: 2, office: 'Valencia', created_at: '2026-11-18T11:00:00+00:00', user_uuid: 'aaaaaaaa-1111-4000-8000-000000000001', supplier: null, exit_type: 'allocation', assigned_to: 'Employee 1' },
  { kind: 'outbound', id: 11, asset_id: 5, asset_name: '', asset_sku: '', quantity: 1, office: 'Valencia', created_at: '2026-11-18T09:00:00+00:00', user_uuid: 'bbbbbbbb-2222-4000-8000-000000000002', supplier: null, exit_type: 'consumption', assigned_to: null },
];

export interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }
type Reply = { status?: number; body?: unknown; raw?: string } | 'network-error';
type Handler = (call: Call) => Reply | Promise<Reply>;

/** JSON bodies are parsed; OAuth2 form bodies (POST /auth/login) become plain objects. */
function parseBody(body: BodyInit | null | undefined): unknown {
  if (!body) return undefined;
  const text = String(body);
  try { return JSON.parse(text); } catch { return Object.fromEntries(new URLSearchParams(text)); }
}

/** fetch mock that records calls; real Response objects so the client parses real bodies. */
export function mockFetch(handler: Handler) {
  const calls: Call[] = [];
  const fetcher = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = { url: String(input), method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: parseBody(init.body) };
    calls.push(call);
    const result = await handler(call);
    if (result === 'network-error') throw new TypeError('Failed to fetch');
    const text = result.raw ?? JSON.stringify(result.body ?? null);
    return new Response(text, { status: result.status ?? 200, headers: { 'Content-Type': result.raw ? 'text/html' : 'application/json' } });
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

/** Default backend: products/orders lists, 201 for orders. */
export function defaultBackend(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return call => {
    const key = `${call.method} ${new URL(call.url).pathname}`;
    if (overrides[key]) return overrides[key]!(call);
    if (key === 'GET /inventory/products') return { body: ASSETS };
    if (key === 'GET /inventory/orders') return { body: ORDERS };
    if (key === 'POST /inventory/orders/inbound') return { status: 201, body: { id: 99, ...(call.body as object), created_at: '2026-11-18T12:00:00+00:00', user_uuid: 'u' } };
    if (key === 'POST /inventory/orders/outbound') return { status: 201, body: { id: 98, ...(call.body as object), created_at: '2026-11-18T12:00:00+00:00', user_uuid: 'u' } };
    return { status: 404, body: { detail: 'Not Found' } };
  };
}

type FakeSession = AuthSession & { loggedIn: boolean; login: jest.Mock; logout: jest.Mock; verify: jest.Mock };

/** In-memory stand-in used by the Hito 5 view tests (already verified when authenticated). */
export function fakeSession(authenticated = true): FakeSession {
  const session: FakeSession = {
    loggedIn: authenticated,
    get account() { return session.loggedIn ? { email: 'ops@nexova.example', role: 'user', profile: {} } : null; },
    getAuthorizationHeader: () => (session.loggedIn ? `Bearer ${TOKEN}` : null),
    isVerified: () => session.loggedIn,
    verify: jest.fn(async () => session.account),
    login: jest.fn(async (): Promise<unknown> => { session.loggedIn = true; return session.account; }),
    register: jest.fn(async (): Promise<unknown> => { session.loggedIn = true; return session.account; }),
    logout: jest.fn((): void => { session.loggedIn = false; }),
  };
  return session;
}

/** Real NexovaAuth validators; only session creation is replaced. */
export const fakeAuth: NexovaAuthModule = {
  TOKEN_STORAGE_KEY: NexovaAuth.TOKEN_STORAGE_KEY,
  validateLoginInput: NexovaAuth.validateLoginInput,
  validateRegistrationInput: NexovaAuth.validateRegistrationInput,
  validateProfileFields: NexovaAuth.validateProfileFields,
  createAuthSession: () => fakeSession(false),
};

export async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

const mounted: { stop(): void }[] = [];
afterEach(() => { while (mounted.length) mounted.pop()!.stop(); });

export interface MountOptions {
  session?: AuthSession;
  /** Build the session from the shared fetch mock (e.g. the real NexovaAuth module). */
  makeSession?: (fetcher: typeof fetch) => AuthSession;
  handler?: Handler;
  /** Skip the initial flush (to observe the UI before the session check resolves). */
  noFlush?: boolean;
}

export async function mountApp(path: string, options: MountOptions = {}) {
  document.body.innerHTML = `
    <nav id="inventory-nav" hidden><a data-link href="/backoffice/inventory/products">Activos</a><a data-link href="/backoffice/inventory/orders">Historial</a></nav>
    <div id="account-tools" hidden><span data-account-email></span><button data-logout type="button">Cerrar sesión</button></div>
    <main id="app"></main>`;
  window.history.replaceState({}, '', path);
  const { fetcher, calls } = mockFetch(options.handler ?? defaultBackend());
  const session = options.session ?? options.makeSession?.(fetcher) ?? fakeSession(true);
  let app: ReturnType<typeof createApp> | null = null;
  const clientOptions: ApiClientOptions = { apiBase: 'http://api.test', fetcher, getAuthorizationHeader: () => session.getAuthorizationHeader(), onUnauthorized: rejected => { void app?.handleUnauthorized(rejected); } };
  const root = document.getElementById('app')!;
  const assign = jest.fn();
  app = createApp({ root, win: window, session, auth: fakeAuth, api: createInventoryApi(clientOptions), accountApi: createAccountApi(clientOptions), nav: document.getElementById('inventory-nav'), account: document.getElementById('account-tools'), assign });
  mounted.push(app);
  const started = app.start();
  if (!options.noFlush) { await started; await flush(); }
  return { app, root, calls, session, assign, started };
}

export function $(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No element for ${selector}`);
  return el;
}

export function setValue(selector: string, value: string, event: 'input' | 'change' = 'input'): void {
  const el = $(selector) as HTMLInputElement | HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
}

export async function submit(selector: string): Promise<void> {
  $(selector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}
