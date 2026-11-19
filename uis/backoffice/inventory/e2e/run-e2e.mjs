#!/usr/bin/env node
/**
 * Hito 5 + AUTH-02 end-to-end verification against a REAL backend, fully isolated from any shared database:
 *   1. disposable PostgreSQL 16 container (TLS on, random port/password, removed afterwards)
 *   2. FastAPI (services/api) with a temporary TinyDB and random JWT secret
 *   3. backoffice static server (serve.cjs) on its own port (CORS allowlisted)
 *   4. data created only through the public API (POST /users, /auth/login, /inventory/*)
 *   5. Jest live integration suite (tests/live.integration.test.ts)
 *   6. headless Chrome smoke test of the four routes (CDP), with screenshots
 *   7. AUTH-02 browser flows: reload persistence, profile read/update, supplier directory 403/manager,
 *      invalid token, server-side 401 during use, logout, wrong password, registration, public website
 *   8. AUTH-03 password recovery/change. Email provider:
 *        - default: a local server that mimics Resend's POST /emails (the API's real Resend adapter
 *          talks to it over HTTP; labelled SIMULATED PROVIDER in the results);
 *        - real Resend when E2E_RESEND_TO is set and a key is available (E2E_RESEND_API_KEY, or RESEND_API_KEY
 *          in the git-ignored services/api/.env): the email is really sent
 *          and read back with GET /emails/{id} (needs a full-access key) to follow the actual link.
 *
 * Requirements: Docker, Google Chrome, services/api/.venv (uv sync), npm install.
 * Usage: npm run e2e   (env: CHROME_PATH, E2E_EVIDENCE_DIR, E2E_KEEP_OPEN=1, E2E_SCREENSHOTS=<regex>,
 *                       E2E_RESEND_API_KEY, E2E_RESEND_TO, E2E_EMAIL_FROM)
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const REPO = resolve(PKG, '../../..');
const API_DIR = join(REPO, 'services/api');
const EVIDENCE = process.env.E2E_EVIDENCE_DIR || join(REPO, 'docs/evidence/inventory-backoffice-05');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
/** Optional filter so a milestone run only (re)writes its own screenshots. */
const SHOT_FILTER = process.env.E2E_SCREENSHOTS ? new RegExp(process.env.E2E_SCREENSHOTS) : null;
/** Real-provider mode is opt-in with E2E_RESEND_TO; the key comes from E2E_RESEND_API_KEY or the git-ignored services/api/.env. */
function resendKeyFromApiEnv() {
  try {
    const line = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../services/api/.env'), 'utf8')
      .split('\n').find(l => /^\s*RESEND_API_KEY\s*=/.test(l));
    return line ? line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') : '';
  } catch { return ''; }
}
if (process.env.E2E_RESEND_TO && !process.env.E2E_RESEND_API_KEY) process.env.E2E_RESEND_API_KEY = resendKeyFromApiEnv();
const REAL_RESEND = Boolean(process.env.E2E_RESEND_API_KEY && process.env.E2E_RESEND_TO);
const results = [];
/** Real Resend deliveries (message id, last_event, created_at). Never the recipient or the token. */
const realDeliveryLog = [];
const cleanups = [];

function check(name, ok, detail = '') {
  results.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`Check failed: ${name}`);
}

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  s.on('error', rej);
});

async function waitHttp(url, timeout = 30000) {
  const end = Date.now() + timeout;
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* starting */ }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${url}`);
    await sleep(250);
  }
}

async function json(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${new URL(url).pathname} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'nexova-e2e-'));
  cleanups.push(() => rmSync(work, { recursive: true, force: true }));

  // 1. Disposable PostgreSQL with TLS (the API enforces sslmode=require).
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'server.key'), '-out', join(work, 'server.crt'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const pgPassword = randomBytes(18).toString('hex');
  const pgName = `nexova-e2e-pg-${randomBytes(4).toString('hex')}`;
  const pgPort = await freePort();
  // Throwaway self-signed cert passed via env (bind mounts of temp dirs are not always shared with Docker Desktop).
  const b64 = file => readFileSync(join(work, file)).toString('base64');
  execFileSync('docker', ['run', '-d', '--rm', '--name', pgName, '-e', `POSTGRES_PASSWORD=${pgPassword}`, '-e', 'POSTGRES_DB=nexova_e2e',
    '-e', `E2E_TLS_CRT=${b64('server.crt')}`, '-e', `E2E_TLS_KEY=${b64('server.key')}`,
    '-p', `127.0.0.1:${pgPort}:5432`, '--entrypoint', 'sh', 'postgres:16-alpine', '-c',
    'echo "$E2E_TLS_CRT" | base64 -d > /tmp/server.crt && echo "$E2E_TLS_KEY" | base64 -d > /tmp/server.key && chown postgres /tmp/server.* && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key'], { stdio: 'ignore' });
  cleanups.push(() => { try { execFileSync('docker', ['rm', '-f', pgName], { stdio: 'ignore' }); } catch { /* gone */ } });
  for (let i = 0; ; i++) {
    try { execFileSync('docker', ['exec', pgName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'nexova_e2e'], { stdio: 'ignore' }); break; } catch { /* booting */ }
    if (i > 120) throw new Error('PostgreSQL container did not become ready');
    await sleep(500);
  }
  check('Disposable PostgreSQL 16 container with TLS is ready', true, `127.0.0.1:${pgPort}`);

  // 1b. Email provider for AUTH-03: local Resend-compatible capture server unless real Resend is configured.
  const captured = [];
  const mailPort = await freePort();
  const mailServer = createHttpServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/emails') {
        const id = `sim_${captured.length + 1}`;
        captured.push({ id, headers: req.headers, body: JSON.parse(raw) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id }));
      }
      if (req.method === 'GET' && req.url === '/__captured') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(captured.map(c => c.body)));
      }
      res.writeHead(404); res.end();
    });
  }).listen(mailPort, '127.0.0.1');
  cleanups.push(() => mailServer.close());
  const mailCaptureUrl = `http://127.0.0.1:${mailPort}`;
  const simulatedKey = `re_e2e_${randomBytes(12).toString('hex')}`;
  const emailEnv = REAL_RESEND
    ? { RESEND_API_KEY: process.env.E2E_RESEND_API_KEY, EMAIL_FROM: process.env.E2E_EMAIL_FROM || 'Nexova <onboarding@resend.dev>', RESEND_API_BASE_URL: 'https://api.resend.com' }
    : { RESEND_API_KEY: simulatedKey, EMAIL_FROM: 'Nexova <onboarding@resend.dev>', RESEND_API_BASE_URL: mailCaptureUrl };

  // 2. Real FastAPI backend with temporary TinyDB.
  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const api = spawn(join(API_DIR, '.venv/bin/uvicorn'), ['app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)], {
    cwd: API_DIR, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env,
      DATABASE_URL: `postgresql+psycopg2://postgres:${pgPassword}@127.0.0.1:${pgPort}/nexova_e2e`,
      SUPPLIER_DB_PATH: join(work, 'tinydb.json'),
      JWT_SECRET_KEY: randomBytes(32).toString('hex'),
      API_ALLOWED_ORIGINS: webOrigin,
      ...emailEnv,
      FRONTEND_BASE_URL: webOrigin,
      PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: '15',
      PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR: '3',
      PASSWORD_RESET_MAX_PER_IP_PER_HOUR: '50' },
  });
  let apiErr = '';
  api.stderr.on('data', d => { apiErr = (apiErr + d).slice(-4000); });
  cleanups.push(() => api.kill('SIGTERM'));
  await waitHttp(`${apiUrl}/health`).catch(e => { throw new Error(`${e.message}\n${apiErr}`); });
  const pgCheck = () => execFileSync('docker', ['exec', pgName, 'psql', '-U', 'postgres', '-d', 'nexova_e2e', '-tAc', 'select count(*) from inventory_assets'], { encoding: 'utf8' }).trim();
  check('FastAPI started against the disposable database (schema created)', pgCheck() === '0');

  // 3. Backoffice static server.
  const web = spawn(process.execPath, [join(PKG, 'serve.cjs'), '--port', String(webPort)], { stdio: 'ignore', env: { ...process.env, NEXOVA_API_URL: apiUrl } });
  cleanups.push(() => web.kill('SIGTERM'));
  await waitHttp(`${webOrigin}/backoffice/inventory/dist/main.js`);

  // 4. Seed through the public API only (briefing seed: NXV-IT-001=12, NXV-PER-001=17).
  const email = `ops-${randomBytes(4).toString('hex')}@nexova.example`;
  const password = randomBytes(16).toString('base64url');
  await json('POST', `${apiUrl}/users`, { body: { email, password } });
  const { access_token: token } = await json('POST', `${apiUrl}/auth/login`, { form: { username: email, password } });
  const assets = {};
  for (const [name, sku, category, office] of [
    ['Portátil 14" Business', 'NXV-IT-001', 'hardware', 'Valencia'], ['Portátil 14" Business', 'NXV-IT-002', 'hardware', 'Miami'],
    ['Ratón ergonómico', 'NXV-PER-001', 'peripherals', 'Valencia'], ['Hub USB-C', 'NXV-PER-002', 'peripherals', 'Miami'],
    ['Resma de papel A4', 'NXV-OFF-001', 'office_supplies', 'Valencia'], ['Cuaderno de formación en liderazgo', 'NXV-TRN-001', 'training_materials', 'Valencia'],
  ]) assets[sku] = await json('POST', `${apiUrl}/inventory/products`, { token, body: { name, sku, category, office } });
  for (const [sku, quantity, supplier] of [['NXV-IT-001', 10, 'TechDistrib Valencia S.L.'], ['NXV-IT-001', 5, 'TechDistrib Valencia S.L.'], ['NXV-PER-001', 20, 'Office Depot Valencia'], ['NXV-IT-002', 8, 'TechDistrib Miami']])
    await json('POST', `${apiUrl}/inventory/orders/inbound`, { token, body: { asset_id: assets[sku].id, quantity, supplier, office: assets[sku].office } });
  for (const [sku, quantity, exit_type, assigned_to] of [['NXV-IT-001', 2, 'allocation', 'Employee 1'], ['NXV-IT-001', 1, 'consumption', null], ['NXV-PER-001', 3, 'allocation', 'Employee 2']])
    await json('POST', `${apiUrl}/inventory/orders/outbound`, { token, body: { asset_id: assets[sku].id, quantity, exit_type, assigned_to, office: assets[sku].office } });
  const seeded = Object.fromEntries((await json('GET', `${apiUrl}/inventory/products`)).map(a => [a.sku, a.current_stock]));
  check('Briefing seed created via API (NXV-IT-001=12, NXV-PER-001=17)', seeded['NXV-IT-001'] === 12 && seeded['NXV-PER-001'] === 17, JSON.stringify(seeded));
  check('Rows exist only in the disposable database', pgCheck() === '6');

  // 5. Jest live integration suite (real API, real auth module, real views).
  // Async spawn: the email capture server lives in this process and must keep answering meanwhile.
  const jest = await new Promise(resolveRun => {
    const child = spawn(join(PKG, 'node_modules/.bin/jest'), ['--runInBand', '--verbose', '--forceExit', 'tests/live.integration.test.ts'], {
      cwd: PKG,
      env: { ...process.env, INVENTORY_E2E_API_URL: apiUrl, INVENTORY_E2E_EMAIL: email, INVENTORY_E2E_PASSWORD: password,
        ...(REAL_RESEND ? {} : { INVENTORY_E2E_MAIL_CAPTURE_URL: mailCaptureUrl }) },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', status => resolveRun({ status, stdout, stderr }));
  });
  const jestText = `${jest.stdout}${jest.stderr}`;
  // eslint-disable-next-line no-control-regex -- strip ANSI colour codes from Jest output
  writeFileSync(join(EVIDENCE, REAL_RESEND ? 'jest-live-integration-real-resend.txt' : 'jest-live-integration.txt'), jestText.replace(/\x1b\[[0-9;]*m/g, ''));
  const jestSummary = (jestText.match(/Tests:.*$/m) || ['no summary'])[0].replace(/\s+/g, ' ');
  if (jest.status !== 0) console.error(jestText.slice(-3000));
  // With real Resend the AUTH-03 live block (which reads the local capture server) is skipped by design.
  check('Jest live API integration suite', jest.status === 0 && (REAL_RESEND || !/skipped/.test(jestSummary)), jestSummary);

  // 6. Browser smoke tests (headless Chrome, real CORS, real network).
  const chrome = await launchChrome(CHROME, await freePort());
  cleanups.push(() => chrome.close());
  // Real-Resend runs use the account owner's real address, which would appear on screen: no screenshots
  // unless E2E_REAL_SCREENSHOTS=1 is set deliberately.
  const shot = name => ((REAL_RESEND && process.env.E2E_REAL_SCREENSHOTS !== '1') || (SHOT_FILTER && !SHOT_FILTER.test(name))
    ? Promise.resolve() : chrome.screenshot(join(EVIDENCE, name)));
  const path = () => chrome.evaluate('location.pathname + location.search');
  const routes = ['/backoffice/inventory/products', '/backoffice/inventory/orders/inbound', '/backoffice/inventory/orders/outbound', '/backoffice/inventory/orders'];
  for (const route of routes) {
    await chrome.goto(`${webOrigin}${route}`);
    await chrome.waitFor('!!document.querySelector("#login-form")');
    const p = await path();
    const leaked = await chrome.evaluate('!!document.querySelector("#product-rows, #order-rows, #inbound-form, #outbound-form")');
    check(`Browser: unauthenticated ${route} redirects to login`, p === `/backoffice/login?next=${encodeURIComponent(route)}` && !leaked, p);
  }
  await shot('00-login.png');
  await chrome.evaluate(`(() => { const f = document.querySelector('#login-form');
    f.username.value = ${JSON.stringify(email)}; f.password.value = ${JSON.stringify(password)};
    f.requestSubmit(); })()`);
  await chrome.waitFor('location.pathname === "/backoffice/inventory/orders" && !!document.querySelector("#order-rows tr[data-kind]")');
  check('Browser: login returns to the requested route (history)', true);
  await chrome.evaluate('document.querySelector(\'#inventory-nav a[href="/backoffice/inventory/products"]\').click()');
  await chrome.waitFor('document.querySelectorAll("#product-rows tr[data-asset-id]").length === 6');
  const levels = await chrome.evaluate('[...document.querySelectorAll("#product-rows tr[data-asset-id]")].map(r => [r.querySelector(".font-mono").textContent, r.querySelector("[data-current-stock]").textContent, r.dataset.stockLevel].join(":"))');
  const level = n => (n <= 0 ? 'out' : n <= 5 ? 'low' : 'ok');
  const expected = (await json('GET', `${apiUrl}/inventory/products`)).map(a => `${a.sku}:${a.current_stock}:${level(a.current_stock)}`);
  check('Browser: products page lists real assets with stock indicators matching the API', JSON.stringify(levels) === JSON.stringify(expected) && levels.some(l => l.endsWith(':out')), levels.join(' '));
  await shot('01-products.png');

  const per = assets['NXV-PER-001'];
  await chrome.evaluate(`document.querySelector('#product-rows tr[data-asset-id="${per.id}"] a[data-action="inbound"]').click()`);
  await chrome.waitFor(`document.querySelector('#asset_id')?.value === '${per.id}'`);
  check('Browser: product action preselects asset in inbound form', (await path()) === `/backoffice/inventory/orders/inbound?asset_id=${per.id}`);
  const stockBefore = (await json('GET', `${apiUrl}/inventory/products`)).find(a => a.id === per.id).current_stock;
  await chrome.evaluate(`(() => { const f = document.querySelector('#inbound-form');
    f.quantity.value = '4'; f.supplier.value = 'Office Depot Valencia'; f.requestSubmit(); f.requestSubmit(); })()`);
  await chrome.waitFor('!!document.querySelector(\'[data-state="success"]\')');
  const stockAfter = (await json('GET', `${apiUrl}/inventory/products`)).find(a => a.id === per.id).current_stock;
  const formReset = await chrome.evaluate('document.querySelector("#asset_id").value === "" && document.querySelector("#quantity").value === ""');
  check('Browser: inbound order succeeds once (double submit guarded), stock +4 in backend, form reset', stockAfter === stockBefore + 4 && formReset, `${stockBefore} -> ${stockAfter}`);
  await shot('02-inbound-success.png');

  await chrome.evaluate('document.querySelector(\'#inventory-nav a[href="/backoffice/inventory/orders/outbound"]\').click()');
  await chrome.waitFor('!!document.querySelector("#outbound-form") && document.querySelector("#asset_id").options.length > 1');
  await chrome.evaluate(`(() => { const s = document.querySelector('#asset_id'); s.value = '${per.id}'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.querySelector('#exit_type'); t.value = 'consumption'; t.dispatchEvent(new Event('change', { bubbles: true }));
    const q = document.querySelector('#quantity'); q.value = '${stockAfter + 5}'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const shown = await chrome.evaluate('document.querySelector("[data-available-stock]").textContent');
  const warned = await chrome.evaluate('!document.querySelector("#quantity-warning").hidden');
  check('Browser: outbound shows live stock and client warning when quantity exceeds it', shown === String(stockAfter) && warned, `stock ${shown}`);
  await chrome.evaluate('document.querySelector("#outbound-form").requestSubmit()');
  await chrome.waitFor('document.querySelector("#quantity-error").textContent.includes("Insufficient stock")');
  check('Browser: real HTTP 400 insufficient stock shown inline beside quantity', true, await chrome.evaluate('document.querySelector("#quantity-error").textContent'));
  await shot('03-outbound-insufficient-stock.png');
  await chrome.evaluate(`(() => { const t = document.querySelector('#exit_type'); t.value = 'allocation'; t.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#assigned_to').value = 'Employee 3';
    const q = document.querySelector('#quantity'); q.value = '2'; q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#outbound-form').requestSubmit(); })()`);
  await chrome.waitFor('!!document.querySelector(\'[data-state="success"]\')');
  const stockOut = (await json('GET', `${apiUrl}/inventory/products`)).find(a => a.id === per.id).current_stock;
  check('Browser: outbound allocation succeeds, stock −2 in backend', stockOut === stockAfter - 2, `${stockAfter} -> ${stockOut}`);
  await shot('04-outbound-success.png');

  await chrome.evaluate('document.querySelector(\'#inventory-nav a[href="/backoffice/inventory/orders"]\').click()');
  await chrome.waitFor('document.querySelectorAll("#order-rows tr[data-kind]").length > 0');
  const apiOrders = await json('GET', `${apiUrl}/inventory/orders`);
  const ui = await chrome.evaluate(`({ rows: document.querySelectorAll('#order-rows tr[data-kind]').length,
    inbound: document.querySelectorAll('#order-rows tr[data-kind="inbound"]').length,
    buttons: document.querySelectorAll('#app button, #app form, #app input').length,
    uuid: document.querySelector('#order-rows [data-user-uuid]').textContent,
    name: document.querySelector('#order-rows [data-asset-name]').textContent })`);
  const me = await json('GET', `${apiUrl}/auth/me`, { token });
  check('Browser: history matches API (all orders, both types, read-only, user_uuid, names)',
    ui.rows === apiOrders.length && ui.inbound === apiOrders.filter(o => o.kind === 'inbound').length && ui.buttons === 0 && /^[0-9a-f-]{36}$/.test(ui.uuid) && ui.name && !ui.name.startsWith('Activo #'),
    `${ui.rows} rows, ${ui.inbound} entradas, uuid ${ui.uuid.slice(0, 8)}…, profile ${me.email === email ? 'ok' : 'mismatch'}`);
  await shot('05-history.png');

  // ---------------------------------------------------------------- AUTH-02 (real API, real JWTs) ----
  const KEY = 'nexova.auth.token';
  const hasToken = () => chrome.evaluate(`localStorage.getItem(${JSON.stringify(KEY)}) !== null`);
  const tinyDbPath = join(work, 'tinydb.json');
  /** Edits the disposable TinyDB user record (role / is_active), as the AUTH-01 guide does for manager tests. */
  const setUser = (userEmail, changes) => {
    const db = JSON.parse(readFileSync(tinyDbPath, 'utf8'));
    const record = Object.values(db.users).find(u => u.email === userEmail);
    Object.assign(record, changes);
    writeFileSync(tinyDbPath, JSON.stringify(db));
  };

  // AUTH02-07: the token survives a full reload (localStorage) and is re-validated with GET /auth/me.
  await chrome.goto(`${webOrigin}/backoffice/inventory/products`);
  await chrome.waitFor('document.querySelectorAll("#product-rows tr[data-asset-id]").length > 0');
  check('AUTH-02 Browser: full reload keeps the session (token in localStorage under nexova.auth.token, re-verified)',
    (await path()) === '/backoffice/inventory/products' && await hasToken() &&
    await chrome.evaluate(`Object.keys(localStorage).join() === ${JSON.stringify(KEY)} && sessionStorage.length === 0 && document.cookie === ""`));
  check('AUTH-02 Browser: shell chrome hidden on login is visible when authenticated',
    await chrome.evaluate('getComputedStyle(document.querySelector("#account-tools")).display !== "none" && document.querySelector("[data-account-email]").textContent.length > 0'));

  // AUTH02-03: profile read (GET /auth/me) and update (PUT /profiles/me).
  await chrome.evaluate('document.querySelector(\'#inventory-nav a[href="/backoffice/account/profile"]\').click()');
  await chrome.waitFor('!!document.querySelector("#profile-form")');
  const shownEmail = await chrome.evaluate('document.querySelector(\'[data-profile-value="email"]\').textContent');
  check('AUTH-02 Browser: /backoffice/account/profile shows the real account from GET /auth/me', shownEmail === email, shownEmail);
  await chrome.evaluate(`(() => { const f = document.querySelector('#profile-form');
    f.name.value = 'Operaciones E2E'; f.phone.value = '+34 600 000 001'; f.address.value = 'Calle de la Paz 5, Valencia'; f.requestSubmit(); })()`);
  await chrome.waitFor('document.querySelector("#profile-status").textContent.includes("Perfil actualizado")');
  const meAfter = await json('GET', `${apiUrl}/auth/me`, { token });
  check('AUTH-02 Browser: profile update persisted by PUT /profiles/me (verified via API)',
    meAfter.profile.name === 'Operaciones E2E' && meAfter.profile.phone === '+34 600 000 001' && meAfter.profile.address === 'Calle de la Paz 5, Valencia');
  await shot('06-profile.png');

  // Supplier directory (second private page): role "user" → real 403, session kept.
  await chrome.goto(`${webOrigin}/backoffice/`);
  await chrome.waitFor('!document.querySelector("#main").hidden && document.querySelector("#page-message").textContent.length > 0');
  check('AUTH-02 Browser: supplier directory with role "user" gets a real 403 → permissions message, session kept',
    (await chrome.evaluate('document.querySelector("#page-message").textContent')).includes('no tiene permisos') && await hasToken() && (await path()) === '/backoffice/');
  // Promote to manager in the disposable TinyDB, create a supplier via API, reload: Bearer accepted.
  setUser(email, { role: 'manager' });
  await json('POST', `${apiUrl}/suppliers`, { token, body: { name: 'LinkedIn Talent', country: 'Spain', categories: ['job_boards'], monthly_rate: 900, currency: 'EUR', status: 'active' } });
  await chrome.goto(`${webOrigin}/backoffice/`);
  await chrome.waitFor('document.querySelector("#supplier-rows").textContent.includes("LinkedIn Talent")');
  check('AUTH-02 Browser: supplier directory with a manager token lists suppliers (Bearer on /suppliers)', true);
  await shot('07-suppliers-manager.png');
  setUser(email, { role: 'user' });

  // AUTH02-10: the API starts rejecting the token during use (account deactivated) → 401 → session cleared.
  await chrome.goto(`${webOrigin}/backoffice/inventory/products`);
  await chrome.waitFor('document.querySelectorAll("#product-rows tr[data-asset-id]").length > 0');
  setUser(email, { is_active: false });
  await chrome.evaluate('document.querySelector(\'#inventory-nav a[href="/backoffice/account/profile"]\').click()');
  await chrome.waitFor('location.pathname === "/backoffice/login"');
  check('AUTH-02 Browser: real 401 during use clears the token and redirects to /login?reason=session',
    !(await hasToken()) && new URLSearchParams(await chrome.evaluate('location.search')).get('reason') === 'session' &&
    await chrome.evaluate('!!document.querySelector(\'[data-state="session-expired"]\')'));
  setUser(email, { is_active: true });

  // AUTH02-05: a forged-but-unexpired token is rejected by the API and removed (claims are never trusted).
  await chrome.evaluate(`localStorage.setItem(${JSON.stringify(KEY)}, [btoa('{"alg":"HS256"}'), btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 600 })).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_'), 'forged'].join('.'))`);
  await chrome.goto(`${webOrigin}/backoffice/inventory/orders`);
  await chrome.waitFor('location.pathname === "/backoffice/login" && !!document.querySelector("#login-form")');
  check('AUTH-02 Browser: forged token → GET /auth/me 401 → removed, redirect to login, no private content',
    !(await hasToken()) && (await path()).includes('reason=session') && !(await chrome.evaluate('!!document.querySelector("#order-rows")')));

  // AUTH02-01 / 14: wrong password → clear error, no token, no redirect loop.
  const loginUrl = `/backoffice/login?next=${encodeURIComponent('/backoffice/account/profile')}`;
  await chrome.goto(`${webOrigin}${loginUrl}`);
  await chrome.waitFor('!!document.querySelector("#login-form")');
  check('AUTH-02 Browser: account tools are not displayed on the login page',
    await chrome.evaluate('getComputedStyle(document.querySelector("#account-tools")).display === "none" && getComputedStyle(document.querySelector("#inventory-nav")).display === "none"'));
  await chrome.evaluate(`(() => { const f = document.querySelector('#login-form'); f.username.value = ${JSON.stringify(email)}; f.password.value = 'definitely-wrong-password'; f.requestSubmit(); })()`);
  await chrome.waitFor('document.querySelector("#login-error").textContent.length > 0');
  await sleep(500);
  check('AUTH-02 Browser: wrong password → clear error, URL unchanged, no token stored',
    (await chrome.evaluate('document.querySelector("#login-error").textContent')) === 'Correo electrónico o contraseña incorrectos.' && (await path()) === loginUrl && !(await hasToken()));
  await shot('08-login-error.png');
  await chrome.evaluate(`(() => { const f = document.querySelector('#login-form'); f.username.value = ${JSON.stringify(email)}; f.password.value = ${JSON.stringify(password)}; f.requestSubmit(); })()`);
  await chrome.waitFor('location.pathname === "/backoffice/account/profile" && !!document.querySelector("#profile-form")');
  check('AUTH-02 Browser: correct password → token stored → redirected to the requested private view', await hasToken());

  // AUTH02-09: logout clears storage and blocks private views.
  await chrome.evaluate('document.querySelector("[data-logout]").click()');
  await chrome.waitFor('location.pathname === "/backoffice/login"');
  const loggedOut = !(await hasToken()) && (await path()) === '/backoffice/login?reason=logout';
  await chrome.goto(`${webOrigin}/backoffice/account/profile`);
  await chrome.waitFor('!!document.querySelector("#login-form")');
  check('AUTH-02 Browser: logout removes the token; private view afterwards redirects to login', loggedOut && (await path()).startsWith('/backoffice/login?next='));

  // AUTH02-02: registration through the UI (/register alias), validation errors, then automatic login.
  await chrome.goto(`${webOrigin}/register`);
  await chrome.waitFor('!!document.querySelector("#register-form")');
  check('AUTH-02 Browser: /register alias serves the registration view', (await path()) === '/backoffice/register');
  await chrome.evaluate(`(() => { const f = document.querySelector('#register-form'); f.email.value = ${JSON.stringify(email)}; f.password.value = 'short'; f.requestSubmit(); })()`);
  const clientError = await chrome.evaluate('document.querySelector("#reg-password-error").textContent');
  await chrome.evaluate(`(() => { const f = document.querySelector('#register-form'); f.password.value = 'long-enough-password'; f.requestSubmit(); })()`);
  await chrome.waitFor('document.querySelector("#reg-email-error").textContent.length > 0');
  check('AUTH-02 Browser: registration field errors (client 8-char rule, real API 409 duplicate email)',
    clientError.includes('entre 8 y 128') && (await chrome.evaluate('document.querySelector("#reg-email-error").textContent')).includes('ya está registrado'), clientError);
  await shot('09-register-errors.png');
  const newEmail = `alta-${randomBytes(4).toString('hex')}@nexova.example`;
  const newPassword = randomBytes(12).toString('base64url');
  await chrome.evaluate(`(() => { const f = document.querySelector('#register-form'); f.email.value = ${JSON.stringify(newEmail)}; f.password.value = ${JSON.stringify(newPassword)};
    f.name.value = 'Nueva Persona'; f.phone.value = '+54 11 4000 0000'; f.address.value = 'Av. Santa Fe 1, Buenos Aires'; f.requestSubmit(); })()`);
  await chrome.waitFor('location.pathname === "/backoffice/inventory/products" && document.querySelectorAll("#product-rows tr[data-asset-id]").length > 0');
  const newToken = (await json('POST', `${apiUrl}/auth/login`, { form: { username: newEmail, password: newPassword } })).access_token;
  const created = await json('GET', `${apiUrl}/auth/me`, { token: newToken });
  check('AUTH-02 Browser: registration → POST /users → POST /auth/login → token stored → main view',
    await hasToken() && created.email === newEmail && created.role === 'user' && created.profile.name === 'Nueva Persona' &&
    (await chrome.evaluate('document.querySelector("[data-account-email]").textContent')) === newEmail);
  await shot('10-registered-main-view.png');

  // AUTH02-06: the Hito 1 public website, served on its own origin, opens with no token and no redirect.
  const sitePort = await freePort();
  const siteDir = join(REPO, 'uis/website');
  const site = createHttpServer((req, res) => {
    const name = (new URL(req.url, 'http://x').pathname.replace(/^\/+/, '') || 'index.html');
    if (!/^[\w.-]+$/.test(name)) { res.writeHead(404); return res.end(); }
    try { const body = readFileSync(join(siteDir, name)); res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  }).listen(sitePort, '127.0.0.1');
  cleanups.push(() => site.close());
  for (const page of ['index.html', 'application.html']) {
    await chrome.goto(`http://127.0.0.1:${sitePort}/${page}`);
    await chrome.waitFor('document.readyState === "complete"');
    await sleep(500);
    const state = await chrome.evaluate('({ path: location.pathname, login: !!document.querySelector("#login-form"), title: document.title, h1: !!document.querySelector("h1"), storage: localStorage.length })');
    check(`AUTH-02 Browser: public website /${page} loads without token, guard or redirect`,
      state.path === `/${page}` && !state.login && state.h1 && state.storage === 0, state.title);
  }
  await shot('11-public-website.png');


  // ---------------------------------------------------------------- AUTH-03 (password recovery) ----
  const providerLabel = REAL_RESEND ? 'REAL Resend' : 'SIMULATED provider (local Resend-compatible server)';
  const realDeliveries = realDeliveryLog;
  if (REAL_RESEND) {
    // Preflight: the read-back needs a FULL-ACCESS key (GET /api-keys answers 200 only for those).
    const probe = await fetch('https://api.resend.com/api-keys', { headers: { Authorization: `Bearer ${process.env.E2E_RESEND_API_KEY}`, 'User-Agent': 'nexova-e2e/1.0' } });
    check('AUTH-03 Real Resend preflight: the configured key is valid and has full access', probe.status === 200, `HTTP ${probe.status}`);
    // Delivery errors from the REAL provider never expose the key (opt-in pytest against api.resend.com).
    const live = await new Promise(done => {
      const child = spawn(join(API_DIR, '.venv/bin/python'), ['-m', 'pytest', '-q', '-m', 'resend_live', 'tests/test_resend_live.py'], { cwd: API_DIR, env: { ...process.env, RESEND_LIVE_TESTS: '1' } });
      let out = '';
      child.stdout.on('data', d => { out += d; });
      child.on('close', status => done({ status, out }));
    });
    check('AUTH-03 Real Resend: provider errors are typed and never contain the key (live pytest)', live.status === 0, (live.out.match(/\d+ passed[^\n]*/) || ['no summary'])[0]);
  }
  const readDb = () => JSON.parse(readFileSync(tinyDbPath, 'utf8'));
  const auditEvents = () => Object.values(readDb().password_audit_events ?? {});
  /** Waits for the reset email the API sent to `to` after `since` and returns { html, text, link, id }. */
  async function fetchResetEmail(to, since) {
    for (let i = 0; i < 100; i++) {
      const sent = auditEvents().filter(e => e.event === 'reset_email' && Date.parse(e.at) > Date.parse(since));
      const failed = sent.find(e => e.outcome !== 'sent');
      if (failed) throw new Error(`reset email not delivered: ${failed.outcome} status=${failed.provider_status} reason=${failed.provider_reason}`);
      const ok = sent.find(e => e.outcome === 'sent');
      if (ok) {
        let mail;
        if (REAL_RESEND) {
          // Real delivery = Resend reports last_event "delivered" (not merely accepted). Up to ~2 minutes.
          for (let j = 0; j < 60; j++) {
            const r = await fetch(`https://api.resend.com/emails/${ok.provider_message_id}`, { headers: { Authorization: `Bearer ${process.env.E2E_RESEND_API_KEY}`, 'User-Agent': 'nexova-e2e/1.0' } });
            if (!r.ok) throw new Error(`Resend GET /emails/{id} -> ${r.status} (a full-access API key is required to read the sent email back)`);
            mail = await r.json();
            if (['bounced', 'complained', 'failed', 'suppressed'].includes(mail.last_event)) throw new Error(`Resend reports last_event=${mail.last_event} for ${ok.provider_message_id}`);
            if (mail.last_event === 'delivered') break;
            await sleep(2000);
          }
          if (mail?.last_event !== 'delivered') throw new Error(`Resend did not report delivery in time (last_event=${mail?.last_event})`);
          realDeliveries.push({ id: ok.provider_message_id, last_event: mail.last_event, created_at: mail.created_at });
        } else {
          mail = captured.find(c => c.id === ok.provider_message_id).body;
        }
        const recipients = Array.isArray(mail.to) ? mail.to : [mail.to];
        if (!recipients.map(r => String(r).toLowerCase()).includes(to)) throw new Error('reset email went to an unexpected recipient');
        // Resend may return text: null; fall back to the HTML body (unescaping &amp;).
        const body = `${mail.text || ''}\n${String(mail.html || '').replace(/&amp;/g, '&')}`;
        const link = (body.match(/https?:\/\/[^\s"'<>]+\/backoffice\/reset-password\?token=[\w-]+/) || [])[0];
        return { html: mail.html, text: mail.text || '', link, id: ok.provider_message_id, lastEvent: mail.last_event };
      }
      await sleep(100);
    }
    throw new Error('timed out waiting for the reset email');
  }
  const nowIso = () => new Date().toISOString();
  const resetEmail = REAL_RESEND ? process.env.E2E_RESEND_TO.trim().toLowerCase() : `recupera-${randomBytes(4).toString('hex')}@nexova.example`;
  const p1 = randomBytes(12).toString('base64url');
  const p2 = randomBytes(12).toString('base64url');
  const p3 = randomBytes(12).toString('base64url');
  await json('POST', `${apiUrl}/users`, { body: { email: resetEmail, password: p1 } });
  const loginStatus = async pw => (await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: resetEmail, password: pw }) })).status;
  const post = async (path, body, headers = {}) => { const r = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

  // F04: the login page shows the link; it opens /forgot-password.
  // Sign out on the backoffice origin (the previous step left the browser on the public website's origin).
  await chrome.goto(`${webOrigin}/backoffice/forgot-password`);
  await chrome.waitFor('!!document.querySelector("#forgot-form")');
  await chrome.evaluate(`localStorage.removeItem(${JSON.stringify(KEY)})`);
  await chrome.goto(`${webOrigin}/login`);
  await chrome.waitFor('!!document.querySelector("#forgot-password-link")');
  check('AUTH-03 Browser: /login shows a visible "¿Olvidaste tu contraseña?" link',
    await chrome.evaluate('(() => { const a = document.querySelector("#forgot-password-link"); const r = a.getBoundingClientRect(); return a.textContent === "¿Olvidaste tu contraseña?" && r.width > 0 && r.height > 0 && getComputedStyle(a).visibility === "visible"; })()'));
  await chrome.evaluate('document.querySelector("#forgot-password-link").click()');
  await chrome.waitFor('location.pathname === "/backoffice/forgot-password" && !!document.querySelector("#forgot-form")');

  // F01 + B01: request recovery for the registered account through the UI.
  const before = nowIso();
  const mailCountBefore = captured.length;
  await chrome.evaluate(`(() => { const f = document.querySelector('#forgot-form'); f.email.value = ${JSON.stringify(resetEmail)}; f.requestSubmit(); f.requestSubmit(); })()`);
  await chrome.waitFor('!!document.querySelector(\'[data-state="forgot-sent"]\')');
  check('AUTH-03 Browser: /forgot-password shows the generic confirmation and disables the form',
    await chrome.evaluate('document.querySelector("#forgot-form button").disabled && document.querySelector("#forgot-email").disabled && document.querySelector(\'[data-state="forgot-sent"]\').textContent.startsWith("Si esa dirección está registrada")'));
  await shot('12-forgot-confirmation.png');
  const mail = await fetchResetEmail(resetEmail, before);
  check(REAL_RESEND ? 'AUTH-03 Email: REAL Resend accepted AND delivered the reset email (last_event=delivered)' : `AUTH-03 Email: reset email accepted by the provider [${providerLabel}]`,
    Boolean(mail.id && mail.link) && (!REAL_RESEND || mail.lastEvent === 'delivered'),
    `message id ${mail.id}${mail.lastEvent ? `, last_event=${mail.lastEvent}` : ''}`);
  if (!REAL_RESEND) {
    const request = captured[captured.length - 1];
    check('AUTH-03 Email: exactly one email for the double-submitted form; Resend request shape (Bearer, User-Agent, from/to/subject/html/text)',
      captured.length === mailCountBefore + 1 && request.headers.authorization === `Bearer ${simulatedKey}` && /^nexova-api\//.test(request.headers['user-agent']) &&
      ['from', 'to', 'subject', 'html', 'text'].every(k => k in request.body));
  }
  check('AUTH-03 Email: link points to the configured frontend /backoffice/reset-password?token=…',
    mail.link.startsWith(`${webOrigin}/backoffice/reset-password?token=`) && mail.html.includes('name="viewport"') && (REAL_RESEND || mail.text.includes(mail.link)));
  const resetToken = new URL(mail.link).searchParams.get('token');

  // EXTRA-01: render the real email HTML on a phone-sized viewport.
  await chrome.setViewport(390, 844, true);
  // The screenshot is committed evidence: render the real email with its token redacted.
  const redactedHtml = mail.html.split(resetToken).join('TOKEN-REDACTADO-EN-EVIDENCIA');
  await chrome.goto(`data:text/html;base64,${Buffer.from(redactedHtml).toString('base64')}`);
  await chrome.waitFor('document.readyState === "complete"');
  const emailLayout = await chrome.evaluate('({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1, button: (() => { const b = [...document.querySelectorAll("a")].find(a => a.textContent.includes("Restablecer")); const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth; })() })');
  check('AUTH-03 EXTRA-01: HTML email is readable on a 390px phone viewport (no horizontal overflow, button visible)', !emailLayout.overflow && emailLayout.button, JSON.stringify(emailLayout));
  await shot('13-reset-email-mobile.png');
  await chrome.clearViewport();

  // No enumeration: unknown address → same status/body, no email.
  const mailsBeforeUnknown = captured.length;
  const known = await post('/auth/forgot-password', { email: resetEmail.toUpperCase() });
  const unknown = await post('/auth/forgot-password', { email: `nadie-${randomBytes(3).toString('hex')}@nexova.example` });
  await sleep(500);
  check('AUTH-03 API: unknown email → HTTP 200 with the identical body, no email sent',
    known.status === 200 && unknown.status === 200 && JSON.stringify(known.body) === JSON.stringify(unknown.body) &&
    (REAL_RESEND || captured.length === mailsBeforeUnknown + 1), JSON.stringify(unknown.body));

  // F02 + B02: follow the emailed link in the browser and set a new password.
  await chrome.goto(mail.link);
  await chrome.waitFor('!!document.querySelector("#reset-form")');
  check('AUTH-03 Browser: reset link opens /reset-password and the token is removed from the address bar', (await path()) === '/backoffice/reset-password');
  await chrome.evaluate(`(() => { const f = document.querySelector('#reset-form'); f.new_password.value = ${JSON.stringify(p2)}; f.confirm_password.value = ${JSON.stringify(p2 + 'x')}; f.requestSubmit(); })()`);
  const mismatch = await chrome.evaluate('document.querySelector("#reset-confirm-error").textContent');
  await chrome.evaluate(`(() => { const f = document.querySelector('#reset-form'); f.confirm_password.value = ${JSON.stringify(p2)}; f.requestSubmit(); })()`);
  await chrome.waitFor('location.pathname === "/backoffice/login" && !!document.querySelector(\'[data-state="password-reset"]\')');
  check('AUTH-03 Browser: mismatch blocked, then reset succeeds and redirects to /login with a success message',
    mismatch === 'Las contraseñas no coinciden.' && (await path()) === '/backoffice/login?reason=password-reset');
  await shot('14-login-after-reset.png');
  check('AUTH-03 API: old password no longer authenticates (401), new password does (200)', (await loginStatus(p1)) === 401 && (await loginStatus(p2)) === 200);

  // Reuse of the same token: API 400 and the browser shows the error + recovery link.
  const reuse = await post('/auth/reset-password', { token: resetToken, new_password: p3 });
  check('AUTH-03 API: reusing the same reset token → HTTP 400', reuse.status === 400, JSON.stringify(reuse.body));
  await chrome.goto(mail.link);
  await chrome.waitFor('!!document.querySelector("#reset-form")');
  await chrome.evaluate(`(() => { const f = document.querySelector('#reset-form'); f.new_password.value = ${JSON.stringify(p3)}; f.confirm_password.value = ${JSON.stringify(p3)}; f.requestSubmit(); })()`);
  await chrome.waitFor('!!document.querySelector(\'[data-state="reset-invalid"]\')');
  check('AUTH-03 Browser: used link → clear error with a link back to /forgot-password',
    await chrome.evaluate('!!document.querySelector(\'[data-state="reset-invalid"] a[href="/backoffice/forgot-password"]\') && !document.querySelector("#reset-form")'));
  await shot('15-reset-link-invalid.png');

  // Expiry: a fresh token whose stored expiry has passed is rejected (TinyDB row aged; window is 15 min).
  const beforeExpiry = nowIso();
  await post('/auth/forgot-password', { email: resetEmail });
  const expiringMail = await fetchResetEmail(resetEmail, beforeExpiry);
  const expiringToken = new URL(expiringMail.link).searchParams.get('token');
  const db = readDb();
  const rows = Object.values(db.password_resets).filter(r => !r.used_at);
  const windowMinutes = (new Date(rows[0].expires_at) - new Date(rows[0].created_at)) / 60000;
  for (const row of rows) row.expires_at = new Date(Date.now() - 1000).toISOString();
  writeFileSync(tinyDbPath, JSON.stringify(db));
  const expired = await post('/auth/reset-password', { token: expiringToken, new_password: p3 });
  check('AUTH-03 API: configured 15-minute window; an expired token → HTTP 400 and the password is unchanged',
    windowMinutes === 15 && expired.status === 400 && (await loginStatus(p2)) === 200, `window ${windowMinutes} min`);

  // F03 + B03: authenticated change-password in the browser.
  await chrome.goto(`${webOrigin}/account/change-password`);
  await chrome.waitFor('!!document.querySelector("#login-form")');
  check('AUTH-03 Browser: /account/change-password requires a session (redirects to login)', (await path()).startsWith('/backoffice/login?next=%2Fbackoffice%2Faccount%2Fchange-password'));
  await chrome.evaluate(`(() => { const f = document.querySelector('#login-form'); f.username.value = ${JSON.stringify(resetEmail)}; f.password.value = ${JSON.stringify(p2)}; f.requestSubmit(); })()`);
  await chrome.waitFor('location.pathname === "/backoffice/account/change-password" && !!document.querySelector("#change-password-form")');
  await chrome.evaluate(`(() => { const f = document.querySelector('#change-password-form'); f.current_password.value = 'definitely-not-it'; f.new_password.value = ${JSON.stringify(p3)}; f.confirm_password.value = ${JSON.stringify(p3)}; f.requestSubmit(); })()`);
  await chrome.waitFor('document.querySelector("#current-password-error").textContent.length > 0');
  check('AUTH-03 Browser: wrong current password → real HTTP 400 → field error, still signed in',
    (await chrome.evaluate('document.querySelector("#current-password-error").textContent')) === 'La contraseña actual no es correcta.' && await hasToken() && (await path()) === '/backoffice/account/change-password');
  await shot('16-change-password-wrong-current.png');
  await chrome.evaluate(`(() => { const f = document.querySelector('#change-password-form'); f.current_password.value = ${JSON.stringify(p2)}; f.new_password.value = ${JSON.stringify(p3)}; f.confirm_password.value = ${JSON.stringify(p3)}; f.requestSubmit(); })()`);
  await chrome.waitFor('(document.querySelector(\'#change-status [role="status"]\')?.textContent || "").includes("Contraseña actualizada")');
  await shot('17-change-password-success.png');
  check('AUTH-03 Browser+API: change-password succeeds; previous password 401, new password 200', (await loginStatus(p2)) === 401 && (await loginStatus(p3)) === 200);
  const anonymous = await post('/auth/change-password', { current_password: p3, new_password: p1 });
  const wrongApi = await post('/auth/change-password', { current_password: 'nope-nope-nope', new_password: p1 }, { Authorization: `Bearer ${(await json('POST', `${apiUrl}/auth/login`, { form: { username: resetEmail, password: p3 } })).access_token}` });
  check('AUTH-03 API: change-password without a token → 401; wrong current password → 400', anonymous.status === 401 && wrongApi.status === 400);

  // EXTRA-02 rate limit (simulated provider only, to avoid sending extra real emails).
  if (!REAL_RESEND) {
    const limited = `limite-${randomBytes(3).toString('hex')}@nexova.example`;
    await json('POST', `${apiUrl}/users`, { body: { email: limited, password: randomBytes(12).toString('base64url') } });
    const count = captured.length;
    for (let i = 0; i < 5; i++) await post('/auth/forgot-password', { email: limited });
    await sleep(500);
    const outcomes = auditEvents().filter(e => e.event === 'reset_requested' && e.outcome === 'rate_limited_email').length;
    check('AUTH-03 EXTRA-02: per-email limit (3/hour) → 5 requests, all HTTP 200, only 3 emails sent', captured.length === count + 3 && outcomes >= 2, `${captured.length - count} emails`);
  }

  // EXTRA-03 audit + secret hygiene across the whole disposable database file.
  const events = auditEvents();
  const kinds = new Set(events.map(e => `${e.event}:${e.outcome}`));
  const auditDump = JSON.stringify(events);
  const dbDump = readFileSync(tinyDbPath, 'utf8');
  check('AUTH-03 EXTRA-03: audit trail with timestamps, IP and user agent for request/email/reset/reject/change',
    ['reset_requested:email_queued', 'reset_requested:unknown_email', 'reset_email:sent', 'reset_completed:password_updated', 'reset_rejected:used', 'reset_rejected:expired', 'password_change_rejected:wrong_current_password', 'password_changed:password_updated'].every(k => kinds.has(k)) &&
    events.every(e => e.at && e.ip === '127.0.0.1' && typeof e.user_agent === 'string'));
  check('AUTH-03 Security: no raw reset token or password anywhere in the database; no email address in the audit trail',
    [resetToken, expiringToken, p1, p2, p3].every(v => !dbDump.includes(v)) && !auditDump.includes(resetEmail));

  const errors = chrome.exceptions.filter(e => !/cdn\.tailwindcss\.com should not be used in production/.test(e));
  check('Browser: no uncaught JavaScript errors', errors.length === 0, errors.join(' | '));
  // Only deliberate failures may appear: insufficient stock (400), the AUTH-02 negative paths
  // (401 wrong password / rejected token, 403 supplier role check, 409 duplicate email) and the favicon.
  const expectedFailure = [/status of 400 .*\/inventory\/orders\/outbound/, /status of 401 .*\/auth\/(login|me)/, /status of 403 .*\/suppliers/, /status of 409 .*\/users/,
    /status of 400 .*\/auth\/(reset-password|change-password)/, /favicon\.ico/];
  const unexpected = chrome.networkErrors.filter(e => !expectedFailure.some(re => re.test(e)));
  check('Browser: no unexpected failed network requests', unexpected.length === 0, chrome.networkErrors.join(' | '));
}

let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(`E2E FAILED: ${error.message}`);
} finally {
  if (!process.env.E2E_KEEP_OPEN) for (const fn of cleanups.reverse()) { try { await fn(); } catch { /* best effort */ } }
  const summary = { date: new Date().toISOString(), emailProvider: REAL_RESEND ? 'resend (real)' : 'simulated (local Resend-compatible server)', ...(REAL_RESEND ? { resendDeliveries: realDeliveryLog } : {}), passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length + (failed && !results.some(r => r.status === 'FAIL') ? 1 : 0), checks: results };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, REAL_RESEND ? 'e2e-results-real-resend.json' : 'e2e-results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`\nE2E: ${summary.passed} passed, ${summary.failed} failed`);
  process.exit(failed ? 1 : 0);
}
