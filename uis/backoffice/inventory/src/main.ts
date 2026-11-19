import { createApp } from './app.js';
import { createInventoryApi } from './lib/inventory.js';
import { getNexovaAuth } from './lib/session.js';

declare global {
  interface Window { NEXOVA_API_URL?: string }
}

// Same API base convention as the supplier directory (uis/backoffice/suppliers).
const apiBase = window.NEXOVA_API_URL || 'http://127.0.0.1:8000';
const auth = getNexovaAuth(window);
const session = auth.createAuthSession({ apiBase });
let app: ReturnType<typeof createApp> | null = null;
const api = createInventoryApi({
  apiBase,
  getAuthorizationHeader: () => session.getAuthorizationHeader(),
  onUnauthorized: () => { void app?.redirectToLogin('session'); },
});
const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
app = createApp({
  root,
  win: window,
  session,
  auth,
  api,
  nav: document.getElementById('inventory-nav'),
  account: document.getElementById('account-tools'),
});
void app.start();
