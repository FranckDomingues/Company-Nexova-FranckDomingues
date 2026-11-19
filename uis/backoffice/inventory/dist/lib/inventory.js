/**
 * Centralized Nexova inventory API client.
 *
 * Every inventory request in the backoffice goes through this module (over the shared authenticated
 * client in ./http.ts); UI views never call `fetch` directly. Types mirror `services/api/app/inventory_schemas.py` exactly.
 */
import { createApiClient } from './http.js';
export { ApiError, parseErrorResponse } from './http.js';
export function createInventoryApi(options) {
    const { request } = createApiClient(options);
    return {
        listProducts: () => request('GET', '/inventory/products'),
        createInboundOrder: order => request('POST', '/inventory/orders/inbound', order),
        createOutboundOrder: order => request('POST', '/inventory/orders/outbound', order),
        listOrders: () => request('GET', '/inventory/orders'),
    };
}
