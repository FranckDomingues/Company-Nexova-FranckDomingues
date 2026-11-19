/**
 * Real frontend/backend integration (no mocks). Runs only when e2e/run-e2e.mjs provides a live API:
 *   INVENTORY_E2E_API_URL, INVENTORY_E2E_EMAIL, INVENTORY_E2E_PASSWORD
 * Uses the real NexovaAuth module (POST /auth/login + GET /auth/me), the real inventory client
 * and the real views, against FastAPI + PostgreSQL.
 */
import { NexovaAuth } from '../../suppliers/src/auth-session';
import { createApp } from '../src/app';
import { createInventoryApi, type InventoryApi } from '../src/lib/inventory';
import type { NexovaAuthModule } from '../src/lib/session';
import { $, flush, setValue, submit } from './helpers';

const API = process.env.INVENTORY_E2E_API_URL;
const EMAIL = process.env.INVENTORY_E2E_EMAIL ?? '';
const PASSWORD = process.env.INVENTORY_E2E_PASSWORD ?? '';
const live = API ? describe : describe.skip;
jest.setTimeout(30_000);

// Compile-time proof that the adapter matches the existing auth module (no second login system).
const realAuth: NexovaAuthModule = NexovaAuth;

async function waitFor(check: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timeout waiting for UI; page text: ${document.getElementById('app')?.textContent?.slice(0, 600)}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

live('live API integration (FastAPI + PostgreSQL)', () => {
  const session = realAuth.createAuthSession({ apiBase: API! });
  let api: InventoryApi;

  beforeAll(async () => {
    await session.login({ username: EMAIL, password: PASSWORD });
    api = createInventoryApi({ apiBase: API!, getAuthorizationHeader: () => session.getAuthorizationHeader() });
  });

  it('authenticates through the existing auth module and obtains a Bearer token', () => {
    expect(session.getAuthorizationHeader()).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(session.account?.email).toBe(EMAIL);
  });

  it('rejects protected writes without a token (real 401)', async () => {
    const anonymous = createInventoryApi({ apiBase: API!, getAuthorizationHeader: () => 'Bearer invalid.token.value' });
    await expect(anonymous.createInboundOrder({ asset_id: 1, quantity: 1, supplier: 'x', office: 'Valencia' })).rejects.toMatchObject({ status: 401 });
  });

  it('inbound order increases stock; outbound decreases it; over-stock is a real HTTP 400', async () => {
    const before = (await api.listProducts()).find(a => a.sku === 'NXV-PER-001')!;
    const entry = await api.createInboundOrder({ asset_id: before.id, quantity: 3, supplier: 'Office Depot Valencia', office: before.office });
    expect(entry.user_uuid).toMatch(/^[0-9a-f-]{36}$/);
    const afterIn = (await api.listProducts()).find(a => a.id === before.id)!;
    expect(afterIn.current_stock).toBe(before.current_stock + 3);
    await api.createOutboundOrder({ asset_id: before.id, quantity: 1, exit_type: 'consumption', assigned_to: null, office: before.office });
    expect((await api.listProducts()).find(a => a.id === before.id)!.current_stock).toBe(afterIn.current_stock - 1);
    const error = await api.createOutboundOrder({ asset_id: before.id, quantity: 10_000, exit_type: 'consumption', assigned_to: null, office: before.office }).catch(e => e);
    expect(error).toMatchObject({ status: 400, message: expect.stringContaining('Insufficient stock') });
    const validation = await api.createOutboundOrder({ asset_id: before.id, quantity: 1, exit_type: 'allocation', assigned_to: null, office: before.office }).catch(e => e);
    expect(validation.status).toBe(422);
    expect(validation.message).toContain('assigned_to is required for allocation');
  });

  it('UI: outbound form shows real stock, inline real 400, and success against the live API', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    const target = (await api.listProducts()).find(a => a.sku === 'NXV-IT-001')!;
    window.history.replaceState({}, '', `/backoffice/inventory/orders/outbound?asset_id=${target.id}`);
    const app = createApp({ root: $('#app'), win: window, session, auth: realAuth, api });
    await app.start();
    await waitFor(() => document.querySelector('[data-available-stock]') !== null);
    expect($('[data-available-stock]').textContent).toBe(String(target.current_stock));
    setValue('#exit_type', 'consumption', 'change');
    setValue('#quantity', String(target.current_stock + 1));
    expect($('#quantity-warning').hidden).toBe(false);
    await submit('#outbound-form');
    await waitFor(() => $('#quantity-error').textContent !== '');
    expect($('#quantity-error').textContent).toContain('Insufficient stock');
    // Wait for the post-400 stock refresh to finish (the duplicate-submit guard is active until then).
    await waitFor(() => !($('#outbound-form button[type="submit"]') as HTMLButtonElement).disabled && $('#outbound-form').getAttribute('aria-busy') === null);
    setValue('#asset_id', String(target.id), 'change');
    setValue('#exit_type', 'allocation', 'change');
    setValue('#assigned_to', 'Employee E2E');
    setValue('#quantity', '1');
    await submit('#outbound-form');
    await waitFor(() => document.querySelector('[data-state="success"]') !== null);
    expect($('[data-state="success"]').textContent).toContain(`Stock actual: ${target.current_stock - 1}`);
    app.stop();
  });

  it('UI: history lists real orders with names, types and the authenticated user_uuid', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    window.history.replaceState({}, '', '/backoffice/inventory/orders');
    const app = createApp({ root: $('#app'), win: window, session, auth: realAuth, api });
    await app.start();
    await waitFor(() => document.querySelectorAll('#order-rows tr[data-kind]').length > 0);
    await flush();
    const orders = await api.listOrders();
    const rows = document.querySelectorAll('#order-rows tr[data-kind]');
    expect(rows).toHaveLength(orders.length);
    expect(document.querySelectorAll('#order-rows tr[data-kind="inbound"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#order-rows tr[data-kind="outbound"]').length).toBeGreaterThan(0);
    expect($('#order-rows [data-asset-name]').textContent).not.toMatch(/^Activo #/);
    expect($('#order-rows [data-user-uuid]').textContent).toMatch(/^[0-9a-f-]{36}$/);
    app.stop();
  });
});
