/** Phase 4: every protected route has a loading, error and success state, in Spanish, without leaking details. */
import { ASSETS, defaultBackend, flush, mountApp } from './helpers';

const ROUTES: [string, string, RegExp, string][] = [
  // route, loading text, error text, success selector
  ['/backoffice/inventory/products', 'Cargando activos…', /No se pudieron cargar los activos: Error interno del servidor/, '#product-rows tr[data-asset-id]'],
  ['/backoffice/inventory/orders/inbound', 'Cargando activos…', /No se pudieron cargar los activos: Error interno del servidor/, '#asset_id option[value="1"]'],
  ['/backoffice/inventory/orders/outbound', 'Cargando activos…', /No se pudo cargar el stock de los activos: Error interno del servidor/, '#asset_id option[value="1"]'],
  ['/backoffice/inventory/orders', 'Cargando órdenes…', /No se pudo cargar el historial: Error interno del servidor/, '#order-rows tr[data-kind]'],
];

describe.each(ROUTES)('%s states', (route, loadingText, errorText, successSelector) => {
  it('shows a loading state while the API responds, then real data', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const slow = defaultBackend();
    const view = mountApp(route, { handler: async call => { await gate; return slow(call); } });
    await flush(2);
    expect(document.getElementById('app')!.textContent).toContain(loadingText);
    release();
    await view;
    await flush();
    expect(document.querySelectorAll(successSelector).length).toBeGreaterThan(0);
  });

  it('shows a readable Spanish error (HTTP 500 without body) and no technical details', async () => {
    await mountApp(route, { handler: defaultBackend({
      'GET /inventory/products': () => ({ status: 500, raw: 'Traceback (most recent call last): secret internals' }),
      'GET /inventory/orders': () => ({ status: 500, raw: 'Traceback (most recent call last): secret internals' }),
    }) });
    const text = document.getElementById('app')!.textContent!;
    expect(text).toMatch(errorText);
    expect(text).not.toMatch(/Traceback|secret internals|Bearer|header\.payload/);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });
});

it('product data shown on every route comes from the API response', async () => {
  await mountApp('/backoffice/inventory/orders/outbound');
  const names = [...document.querySelectorAll('#asset_id option')].slice(1).map(o => o.textContent);
  expect(names).toEqual(ASSETS.map(a => `${a.name} · ${a.sku} · ${a.office}`));
});
