/** Items 10–14: stock display, reactive product change, over-stock warning, inline 400, success. */
import { $, ASSETS, defaultBackend, flush, mountApp, setValue, submit } from './helpers';

const PATH = '/backoffice/inventory/orders/outbound';

describe('outbound order form', () => {
  it('shows the selected product current_stock before submission and reacts to changes', async () => {
    await mountApp(`${PATH}?asset_id=1`);
    expect($('[data-available-stock]').textContent).toBe('12');
    setValue('#asset_id', '3', 'change');
    expect($('[data-available-stock]').textContent).toBe('4');
    expect($('#stock-panel').textContent).toContain('Stock bajo');
    setValue('#asset_id', '5', 'change');
    expect($('[data-available-stock]').textContent).toBe('0');
    expect($('#stock-panel').textContent).toContain('Sin stock');
  });

  it('warns client-side when quantity exceeds available stock (without blocking the server check)', async () => {
    const { calls } = await mountApp(`${PATH}?asset_id=3`);
    const warning = $('#quantity-warning');
    setValue('#quantity', '4');
    expect(warning.hidden).toBe(true);
    setValue('#quantity', '9');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('(9) supera el stock disponible (4)');
    expect($('#quantity').getAttribute('aria-describedby')).toContain('quantity-warning');
    setValue('#asset_id', '1', 'change'); // switching product re-evaluates the warning
    expect(warning.hidden).toBe(true);
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('shows the API HTTP 400 insufficient-stock error inline beside quantity and refreshes stock', async () => {
    const detail = "Insufficient stock for asset 'Ratón ergonómico'. Available: 2, requested: 9.";
    let stock = 4;
    const { calls } = await mountApp(`${PATH}?asset_id=3`, { handler: defaultBackend({
      'GET /inventory/products': () => ({ body: ASSETS.map(a => (a.id === 3 ? { ...a, current_stock: stock } : a)) }),
      'POST /inventory/orders/outbound': () => { stock = 2; return { status: 400, body: { detail } }; },
    }) });
    setValue('#exit_type', 'consumption', 'change');
    setValue('#quantity', '9');
    await submit('#outbound-form');
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1); // client warning never replaces backend enforcement
    const inline = $('#quantity-error');
    expect(inline.textContent).toBe(detail);
    expect(inline.parentElement).toBe($('#quantity').parentElement);
    expect($('#quantity').getAttribute('aria-invalid')).toBe('true');
    expect($('[data-available-stock]').textContent).toBe('2');
    expect(document.querySelector('#form-status [role="alert"]')).toBeNull();
  });

  it('registers an allocation, confirms success and resets', async () => {
    const { calls } = await mountApp(`${PATH}?asset_id=1`);
    setValue('#exit_type', 'allocation', 'change');
    setValue('#assigned_to', 'Lucía Pérez');
    setValue('#quantity', '2');
    await submit('#outbound-form');
    expect(calls.find(c => c.method === 'POST')!.body).toEqual({ asset_id: 1, quantity: 2, exit_type: 'allocation', assigned_to: 'Lucía Pérez', office: 'Valencia' });
    expect($('[data-state="success"]').textContent).toContain('Salida registrada: −2 × Portátil 14" Business');
    expect($('[data-state="success"]').textContent).toContain('asignado a Lucía Pérez');
    expect(($('#quantity') as HTMLInputElement).value).toBe('');
    expect(($('#asset_id') as HTMLSelectElement).value).toBe('');
  });

  it('sends assigned_to=null for consumption and requires an employee for allocation', async () => {
    const { calls } = await mountApp(`${PATH}?asset_id=5`);
    setValue('#quantity', '1');
    await submit('#outbound-form');
    expect($('#assigned_to-error').textContent).toContain('empleado');
    expect(calls.some(c => c.method === 'POST')).toBe(false);
    setValue('#exit_type', 'consumption', 'change');
    expect(($('#assigned_to') as HTMLInputElement).disabled).toBe(true);
    setValue('#asset_id', '5', 'change');
    setValue('#quantity', '1');
    await submit('#outbound-form');
    expect(calls.find(c => c.method === 'POST')!.body).toMatchObject({ exit_type: 'consumption', assigned_to: null });
    await flush();
  });
});
