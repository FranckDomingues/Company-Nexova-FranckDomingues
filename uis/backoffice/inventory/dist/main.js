import { createApp } from './app.js';
import { createAccountApi } from './lib/account.js';
import { createInventoryApi } from './lib/inventory.js';
import { getNexovaAuth } from './lib/session.js';
// Same API base convention as the supplier directory (uis/backoffice/suppliers).
const apiBase = window.NEXOVA_API_URL || 'http://127.0.0.1:8000';
const auth = getNexovaAuth(window);
const session = auth.createAuthSession({ apiBase });
let app = null;
// One authenticated client configuration for every protected resource (Bearer + 401 handling).
const clientOptions = {
    apiBase,
    getAuthorizationHeader: () => session.getAuthorizationHeader(),
    onUnauthorized: rejected => { void app?.handleUnauthorized(rejected); },
};
const root = document.getElementById('app');
if (!root)
    throw new Error('Missing #app root element');
app = createApp({
    root,
    win: window,
    session,
    auth,
    api: createInventoryApi(clientOptions),
    accountApi: createAccountApi(clientOptions),
    nav: document.getElementById('inventory-nav'),
    account: document.getElementById('account-tools'),
});
void app.start();
