/** Items 15–18: history rendering, product name resolution, inbound/outbound distinction, read-only. */
import { resolveAssetName } from '../src/views/history';
import { $, ASSETS, ORDERS, defaultBackend, mountApp } from './helpers';

describe('order history', () => {
  it('renders every order with product, quantity, type, timestamp and user_uuid (newest first)', async () => {
    const { calls } = await mountApp('/backoffice/inventory/orders');
    expect(calls.map(c => new URL(c.url).pathname).sort()).toEqual(['/inventory/orders', '/inventory/products']);
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('#order-rows tr[data-kind]')];
    expect(rows.map(r => r.dataset.orderId)).toEqual(['outbound-10', 'inbound-17', 'outbound-11']);
    const first = rows[0];
    expect(first.querySelector('[data-asset-name]')!.textContent).toBe('Portátil 14" Business');
    expect(first.textContent).toContain('−2');
    expect(first.querySelector('time')!.getAttribute('datetime')).toBe('2026-11-18T11:00:00+00:00');
    expect(first.querySelector('time')!.textContent).toMatch(/2026/);
    expect(first.querySelector('[data-user-uuid]')!.textContent).toBe('aaaaaaaa-1111-4000-8000-000000000001');
    expect(first.textContent).toContain('Asignación a empleado: Employee 1');
    expect(rows[1].textContent).toContain('Proveedor: TechDistrib Valencia S.L.');
    expect($('#history-summary').textContent).toContain('3 órdenes · 1 entradas · 2 salidas');
  });

  it('resolves product names from API data (asset_name, then GET /inventory/products), never inventing them', async () => {
    const byId = new Map(ASSETS.map(a => [a.id, a]));
    expect(resolveAssetName(ORDERS[0], byId)).toEqual({ name: 'Portátil 14" Business', sku: 'NXV-IT-001' });
    expect(resolveAssetName(ORDERS[2], byId)).toEqual({ name: 'Resma de papel A4', sku: 'NXV-OFF-001' });
    expect(resolveAssetName({ ...ORDERS[2], asset_id: 404 }, new Map())).toEqual({ name: 'Activo #404 (sin datos)', sku: '' });
    await mountApp('/backoffice/inventory/orders');
    expect($('#order-rows tr[data-order-id="outbound-11"] [data-asset-name]').textContent).toBe('Resma de papel A4');
  });

  it('visually distinguishes entradas and salidas', async () => {
    await mountApp('/backoffice/inventory/orders');
    const inbound = $('#order-rows tr[data-kind="inbound"]');
    const outbound = $('#order-rows tr[data-kind="outbound"]');
    expect(inbound.querySelector('[data-kind-badge]')!.textContent).toBe('↓Entrada');
    expect(outbound.querySelector('[data-kind-badge]')!.textContent).toBe('↑Salida');
    expect(inbound.querySelector('[data-kind-accent]')!.className).toContain('border-l-emerald-500');
    expect(outbound.querySelector('[data-kind-accent]')!.className).toContain('border-l-amber-500');
    expect(inbound.className).not.toBe(outbound.className);
    expect(inbound.textContent).toContain('+10');
  });

  it('is read-only: no forms, buttons, inputs or edit/delete actions', async () => {
    const { calls } = await mountApp('/backoffice/inventory/orders');
    const root = $('#app');
    expect(root.querySelectorAll('form, button, input, select, textarea')).toHaveLength(0);
    expect(root.textContent).not.toMatch(/Editar|Eliminar|Borrar/i);
    expect(calls.every(c => c.method === 'GET')).toBe(true);
  });

  it('shows empty and error states', async () => {
    await mountApp('/backoffice/inventory/orders', { handler: defaultBackend({ 'GET /inventory/orders': () => ({ body: [] }) }) });
    expect($('[data-state="empty"]').textContent).toContain('Todavía no hay órdenes');
    await mountApp('/backoffice/inventory/orders', { handler: defaultBackend({ 'GET /inventory/orders': () => ({ status: 500, body: { detail: 'boom' } }) }) });
    expect($('[data-state="error"]').textContent).toContain('No se pudo cargar el historial: boom');
  });
});
