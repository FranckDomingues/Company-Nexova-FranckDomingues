/** Items 1–3: centralized API integration, Bearer token, HTTP error parsing. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiError, createInventoryApi, parseErrorResponse } from '../src/lib/inventory';
import { mockFetch, TOKEN } from './helpers';

function api(handler: Parameters<typeof mockFetch>[0], header: string | null = `Bearer ${TOKEN}`) {
  const { fetcher, calls } = mockFetch(handler);
  const onUnauthorized = jest.fn();
  return { client: createInventoryApi({ apiBase: 'http://api.test/', fetcher, getAuthorizationHeader: () => header, onUnauthorized }), calls, onUnauthorized };
}

describe('centralized inventory API client', () => {
  it('exposes the four required operations with the real paths and methods', async () => {
    const { client, calls } = api(() => ({ status: 200, body: [] }));
    await client.listProducts();
    await client.listOrders();
    await client.createInboundOrder({ asset_id: 1, quantity: 3, supplier: 'TechDistrib', office: 'Valencia' });
    await client.createOutboundOrder({ asset_id: 1, quantity: 1, exit_type: 'consumption', assigned_to: null, office: 'Valencia' });
    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      'GET http://api.test/inventory/products',
      'GET http://api.test/inventory/orders',
      'POST http://api.test/inventory/orders/inbound',
      'POST http://api.test/inventory/orders/outbound',
    ]);
    expect(calls[2].body).toEqual({ asset_id: 1, quantity: 3, supplier: 'TechDistrib', office: 'Valencia' });
    expect(calls[2].headers['Content-Type']).toBe('application/json');
  });

  it('sends Authorization: Bearer <token> on every request', async () => {
    const { client, calls } = api(() => ({ body: [] }));
    await client.listProducts();
    await client.createInboundOrder({ asset_id: 1, quantity: 1, supplier: 'x', office: 'Miami' });
    expect(calls.every(c => c.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it('does not call the API without a session and routes to login', async () => {
    const { client, calls, onUnauthorized } = api(() => ({ body: [] }), null);
    await expect(client.listProducts()).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('calls onUnauthorized on HTTP 401 and surfaces the API detail', async () => {
    const { client, onUnauthorized } = api(() => ({ status: 401, body: { detail: 'Invalid or expired bearer token' } }));
    await expect(client.listOrders()).rejects.toMatchObject({ status: 401, message: 'Invalid or expired bearer token' });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('views never call fetch directly (all requests go through lib/inventory.ts)', () => {
    const dir = path.join(__dirname, '..', 'src', 'views');
    for (const file of fs.readdirSync(dir)) {
      expect(fs.readFileSync(path.join(dir, file), 'utf8')).not.toMatch(/\bfetch\s*\(/);
    }
  });
});

describe('HTTP error parsing', () => {
  const cases: [number, unknown, string][] = [
    [400, { detail: "Insufficient stock for asset 'Ratón'. Available: 4, requested: 9." }, "Insufficient stock for asset 'Ratón'. Available: 4, requested: 9."],
    [403, { detail: 'Insufficient permissions' }, 'Insufficient permissions'],
    [404, { detail: 'Asset not found' }, 'Asset not found'],
    [500, null, 'Error interno del servidor de inventario. Inténtalo de nuevo más tarde.'],
  ];
  it.each(cases)('HTTP %i → readable message', async (status, body, message) => {
    const { client } = api(() => ({ status, body }));
    const error = await client.listProducts().catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message });
  });

  it('parses FastAPI 422 validation arrays into field errors', async () => {
    const response = new Response(JSON.stringify({ detail: [
      { loc: ['body', 'quantity'], msg: 'Input should be greater than 0', type: 'greater_than' },
      { loc: ['body'], msg: 'Value error, assigned_to is required for allocation', type: 'value_error' },
    ] }), { status: 422 });
    const error = await parseErrorResponse(response);
    expect(error.status).toBe(422);
    expect(error.fieldErrors).toEqual({ quantity: 'Input should be greater than 0' });
    expect(error.message).toContain('assigned_to is required for allocation');
  });

  it('handles non-JSON 500 pages and network failures', async () => {
    const html = api(() => ({ status: 502, raw: '<html>Bad gateway</html>' }));
    await expect(html.client.listOrders()).rejects.toMatchObject({ status: 502, message: expect.stringContaining('servidor') });
    const offline = api(() => 'network-error');
    await expect(offline.client.listOrders()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('No se pudo conectar') });
  });
});
