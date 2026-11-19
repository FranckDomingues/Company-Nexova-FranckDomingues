/** Items 4–6: products from the API, stock indicators, product-specific navigation. */
import { LOW_STOCK_THRESHOLD, stockLevel } from '../src/stock';
import { $, ASSETS, defaultBackend, flush, mountApp } from './helpers';

describe('product inventory page', () => {
  it('renders products fetched from GET /inventory/products with current_stock', async () => {
    const { calls } = await mountApp('/backoffice/inventory/products');
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /inventory/products']);
    const rows = document.querySelectorAll('#product-rows tr[data-asset-id]');
    expect(rows).toHaveLength(ASSETS.length);
    expect(rows[0].textContent).toContain('Portátil 14" Business');
    expect(rows[0].textContent).toContain('NXV-IT-001');
    expect(rows[0].textContent).toContain('Hardware');
    expect(rows[0].textContent).toContain('Valencia');
    expect(rows[0].querySelector('[data-current-stock]')!.textContent).toBe('12');
  });

  it('applies documented stock thresholds: 0 out, 1–5 low, >5 available', async () => {
    expect([0, 1, LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD + 1, -1].map(stockLevel)).toEqual(['out', 'low', 'low', 'ok', 'out']);
    await mountApp('/backoffice/inventory/products');
    const levels = [...document.querySelectorAll('#product-rows tr')].map(r => (r as HTMLElement).dataset.stockLevel);
    expect(levels).toEqual(['ok', 'low', 'out']);
    const badges = [...document.querySelectorAll('[data-stock-level]')].filter(e => e.tagName === 'SPAN').map(e => e.textContent);
    expect(badges).toEqual(['Disponible', 'Stock bajo', 'Sin stock']);
    expect(document.body.textContent).toContain(`1–${LOW_STOCK_THRESHOLD} unidades`);
  });

  it('inbound/outbound actions carry the selected product into the form', async () => {
    await mountApp('/backoffice/inventory/products');
    const row = $('#product-rows tr[data-asset-id="3"]');
    const inboundLink = row.querySelector('a[data-action="inbound"]') as HTMLAnchorElement;
    expect(inboundLink.textContent).toContain('Registrar entrada');
    expect(inboundLink.getAttribute('aria-label')).toContain('Ratón ergonómico');
    inboundLink.click();
    await flush();
    expect(window.location.pathname + window.location.search).toBe('/backoffice/inventory/orders/inbound?asset_id=3');
    expect(($('#asset_id') as HTMLSelectElement).value).toBe('3');
    window.history.back();
    await flush(12);
  });

  it('outbound action preselects the product and shows its stock', async () => {
    await mountApp('/backoffice/inventory/products');
    ($('#product-rows tr[data-asset-id="1"] a[data-action="outbound"]') as HTMLAnchorElement).click();
    await flush();
    expect(window.location.pathname).toBe('/backoffice/inventory/orders/outbound');
    expect(($('#asset_id') as HTMLSelectElement).value).toBe('1');
    expect($('[data-available-stock]').textContent).toBe('12');
  });

  it('shows loading, empty and error states', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const view = mountApp('/backoffice/inventory/products', { handler: defaultBackend({ 'GET /inventory/products': async () => { await pending; return { body: [] }; } }) });
    await flush(2);
    expect(document.querySelector('[data-state="loading"]')?.textContent).toBe('Cargando activos…');
    release();
    await view;
    expect(document.querySelector('[data-state="empty"]')?.textContent).toContain('No hay activos');

    await mountApp('/backoffice/inventory/products', { handler: defaultBackend({ 'GET /inventory/products': () => ({ status: 500, body: { detail: 'Database unavailable' } }) }) });
    expect($('[data-state="error"]').textContent).toContain('Database unavailable');
    expect($('[data-state="error"] button').textContent).toBe('Reintentar');
  });
});
