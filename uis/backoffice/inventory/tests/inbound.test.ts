/** Items 7–9: inbound success, HTTP 400/500 failures, form reset (+ validation and duplicate guard). */
import { $, ASSETS, defaultBackend, flush, mountApp, setValue, submit } from './helpers';

const PATH = '/backoffice/inventory/orders/inbound';

describe('inbound order form', () => {
  it('lists product names (not ids) and derives the receiving office', async () => {
    await mountApp(`${PATH}?asset_id=1`);
    const options = [...($('#asset_id') as HTMLSelectElement).options].map(o => o.textContent);
    expect(options).toEqual(['Selecciona un activo', ...ASSETS.map(a => `${a.name} · ${a.sku} · ${a.office}`)]);
    expect($('#office').textContent).toBe('Valencia');
  });

  it('posts a valid entrada, confirms, refreshes stock and resets the form', async () => {
    let stock = 12;
    const { calls } = await mountApp(`${PATH}?asset_id=1`, { handler: defaultBackend({
      'GET /inventory/products': () => ({ body: ASSETS.map(a => (a.id === 1 ? { ...a, current_stock: stock } : a)) }),
      'POST /inventory/orders/inbound': call => { stock += (call.body as { quantity: number }).quantity; return { status: 201, body: { id: 50, ...(call.body as object), created_at: '2026-11-18T12:00:00Z', user_uuid: 'u' } }; },
    }) });
    setValue('#quantity', '5');
    setValue('#supplier', '  TechDistrib Valencia S.L. ');
    await submit('#inbound-form');
    const post = calls.find(c => c.method === 'POST')!;
    expect(post.body).toEqual({ asset_id: 1, quantity: 5, supplier: 'TechDistrib Valencia S.L.', office: 'Valencia' });
    expect($('[data-state="success"]').textContent).toContain('Entrada registrada: +5 × Portátil 14" Business');
    expect($('[data-state="success"]').textContent).toContain('Stock actual: 17');
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(2); // stock re-fetched after success
    expect(($('#asset_id') as HTMLSelectElement).value).toBe('');
    expect(($('#quantity') as HTMLInputElement).value).toBe('');
    expect(($('#supplier') as HTMLInputElement).value).toBe('');
  });

  it('validates required fields client-side without calling the API', async () => {
    const { calls } = await mountApp(PATH);
    setValue('#quantity', '0');
    await submit('#inbound-form');
    expect(calls.some(c => c.method === 'POST')).toBe(false);
    expect($('#asset_id-error').textContent).toBe('Selecciona el activo recibido.');
    expect($('#quantity-error').textContent).toContain('al menos 1');
    expect($('#supplier-error').textContent).toBe('Indica el proveedor o vendedor.');
    expect($('#quantity').getAttribute('aria-invalid')).toBe('true');
    setValue('#quantity', '2.5');
    await submit('#inbound-form');
    expect($('#quantity-error').textContent).toContain('número entero');
  });

  it.each([
    [400, { detail: 'Order office must match asset office' }, 'HTTP 400'],
    [500, { detail: 'Internal Server Error' }, 'HTTP 500'],
  ])('shows a readable error for HTTP %i and keeps the input', async (status, body, label) => {
    await mountApp(`${PATH}?asset_id=3`, { handler: defaultBackend({ 'POST /inventory/orders/inbound': () => ({ status, body }) }) });
    setValue('#quantity', '4');
    setValue('#supplier', 'Office Depot Valencia');
    await submit('#inbound-form');
    const alert = $('#form-status [role="alert"]');
    expect(alert.textContent).toContain(label);
    expect(alert.textContent).toContain((body as { detail: string }).detail);
    expect(($('#quantity') as HTMLInputElement).value).toBe('4');
    expect(($('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('prevents duplicate submissions while a request is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const { calls } = await mountApp(`${PATH}?asset_id=1`, { handler: defaultBackend({
      'POST /inventory/orders/inbound': async call => { await gate; return { status: 201, body: { id: 1, ...(call.body as object), created_at: 'x', user_uuid: 'u' } }; },
    }) });
    setValue('#quantity', '1');
    setValue('#supplier', 'Proveedor');
    const form = $('#inbound-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(2);
    const button = $('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Registrando…');
    release();
    await flush();
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });

  it('never fails silently: a 401 on submit sends the user to login with an explanation', async () => {
    await mountApp(`${PATH}?asset_id=1`, { handler: defaultBackend({ 'POST /inventory/orders/inbound': () => ({ status: 401, body: { detail: 'Invalid or expired bearer token' } }) }) });
    setValue('#quantity', '2');
    setValue('#supplier', 'TechDistrib Valencia S.L.');
    await submit('#inbound-form');
    expect(window.location.pathname).toBe('/backoffice/login');
    expect(new URLSearchParams(window.location.search).get('next')).toBe(`${PATH}?asset_id=1`);
    expect($('[data-state="session-expired"]').textContent).toContain('La última operación no se completó');
  });

  it('never fails silently: success with a failed stock refresh shows both, without stale stock', async () => {
    let gets = 0;
    await mountApp(`${PATH}?asset_id=1`, { handler: defaultBackend({
      'GET /inventory/products': () => (++gets === 1 ? { body: ASSETS } : { status: 500, body: { detail: 'Database unavailable' } }),
    }) });
    setValue('#quantity', '5');
    setValue('#supplier', 'TechDistrib Valencia S.L.');
    await submit('#inbound-form');
    const success = $('[data-state="success"]').textContent!;
    expect(success).toContain('Entrada registrada: +5 × Portátil 14" Business');
    expect(success).not.toContain('Stock actual');
    expect($('[data-state="refresh-error"]').textContent).toContain('no se pudo actualizar el stock mostrado');
  });
});
