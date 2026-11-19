#!/usr/bin/env node
/**
 * Hito 5 end-to-end verification against a REAL backend, fully isolated from any shared database:
 *   1. disposable PostgreSQL 16 container (TLS on, random port/password, removed afterwards)
 *   2. FastAPI (services/api) with a temporary TinyDB and random JWT secret
 *   3. backoffice static server (serve.cjs) on its own port (CORS allowlisted)
 *   4. data created only through the public API (POST /users, /auth/login, /inventory/*)
 *   5. Jest live integration suite (tests/live.integration.test.ts)
 *   6. headless Chrome smoke test of the four routes (CDP), with screenshots
 *
 * Requirements: Docker, Google Chrome, services/api/.venv (uv sync), npm install.
 * Usage: npm run e2e   (env: CHROME_PATH, E2E_EVIDENCE_DIR, E2E_KEEP_OPEN=1)
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const results = [];
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
      API_ALLOWED_ORIGINS: webOrigin },
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
  const jest = spawnSync(join(PKG, 'node_modules/.bin/jest'), ['--runInBand', '--verbose', 'tests/live.integration.test.ts'], {
    cwd: PKG, encoding: 'utf8',
    env: { ...process.env, INVENTORY_E2E_API_URL: apiUrl, INVENTORY_E2E_EMAIL: email, INVENTORY_E2E_PASSWORD: password },
  });
  const jestText = `${jest.stdout}${jest.stderr}`;
  // eslint-disable-next-line no-control-regex -- strip ANSI colour codes from Jest output
  writeFileSync(join(EVIDENCE, 'jest-live-integration.txt'), jestText.replace(/\x1b\[[0-9;]*m/g, ''));
  const jestSummary = (jestText.match(/Tests:.*$/m) || ['no summary'])[0].replace(/\s+/g, ' ');
  if (jest.status !== 0) console.error(jestText.slice(-3000));
  check('Jest live API integration suite', jest.status === 0 && !/skipped/.test(jestSummary), jestSummary);

  // 6. Browser smoke tests (headless Chrome, real CORS, real network).
  const chrome = await launchChrome(CHROME, await freePort());
  cleanups.push(() => chrome.close());
  const path = () => chrome.evaluate('location.pathname + location.search');
  const routes = ['/backoffice/inventory/products', '/backoffice/inventory/orders/inbound', '/backoffice/inventory/orders/outbound', '/backoffice/inventory/orders'];
  for (const route of routes) {
    await chrome.goto(`${webOrigin}${route}`);
    await chrome.waitFor('!!document.querySelector("#login-form")');
    const p = await path();
    const leaked = await chrome.evaluate('!!document.querySelector("#product-rows, #order-rows, #inbound-form, #outbound-form")');
    check(`Browser: unauthenticated ${route} redirects to login`, p === `/backoffice/login?next=${encodeURIComponent(route)}` && !leaked, p);
  }
  await chrome.screenshot(join(EVIDENCE, '00-login.png'));
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
  await chrome.screenshot(join(EVIDENCE, '01-products.png'));

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
  await chrome.screenshot(join(EVIDENCE, '02-inbound-success.png'));

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
  await chrome.screenshot(join(EVIDENCE, '03-outbound-insufficient-stock.png'));
  await chrome.evaluate(`(() => { const t = document.querySelector('#exit_type'); t.value = 'allocation'; t.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#assigned_to').value = 'Employee 3';
    const q = document.querySelector('#quantity'); q.value = '2'; q.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#outbound-form').requestSubmit(); })()`);
  await chrome.waitFor('!!document.querySelector(\'[data-state="success"]\')');
  const stockOut = (await json('GET', `${apiUrl}/inventory/products`)).find(a => a.id === per.id).current_stock;
  check('Browser: outbound allocation succeeds, stock −2 in backend', stockOut === stockAfter - 2, `${stockAfter} -> ${stockOut}`);
  await chrome.screenshot(join(EVIDENCE, '04-outbound-success.png'));

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
  await chrome.screenshot(join(EVIDENCE, '05-history.png'));

  await chrome.goto(`${webOrigin}/backoffice/inventory/products`);
  await chrome.waitFor('!!document.querySelector("#login-form")');
  check('Browser: full reload drops the in-memory session (no token persisted in storage)',
    await chrome.evaluate('localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === ""'));
  const errors = chrome.exceptions.filter(e => !/cdn\.tailwindcss\.com should not be used in production/.test(e));
  check('Browser: no uncaught JavaScript errors', errors.length === 0, errors.join(' | '));
  // Only the deliberate insufficient-stock 400 and the absent favicon may fail at network level.
  const unexpected = chrome.networkErrors.filter(e => !/status of 400 .*\/inventory\/orders\/outbound/.test(e) && !/favicon\.ico/.test(e));
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
  const summary = { date: new Date().toISOString(), passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length + (failed && !results.some(r => r.status === 'FAIL') ? 1 : 0), checks: results };
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, 'e2e-results.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`\nE2E: ${summary.passed} passed, ${summary.failed} failed`);
  process.exit(failed ? 1 : 0);
}
