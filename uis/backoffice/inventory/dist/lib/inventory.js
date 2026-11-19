/**
 * Centralized Nexova inventory API client.
 *
 * Every inventory request in the backoffice goes through this module; UI views never call
 * `fetch` directly. Types mirror `services/api/app/inventory_schemas.py` exactly.
 */
/** Status 0 means the request never reached the API (network/CORS failure). */
export class ApiError extends Error {
    constructor(status, message, fieldErrors = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}
const STATUS_MESSAGES = {
    400: 'La solicitud no es válida.',
    401: 'Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.',
    403: 'No tienes permisos para realizar esta acción.',
    404: 'El recurso solicitado no existe.',
    409: 'El registro ya existe.',
    422: 'Revisa los datos del formulario.',
    500: 'Error interno del servidor de inventario. Inténtalo de nuevo más tarde.',
};
function fallbackMessage(status) {
    return STATUS_MESSAGES[status] ?? (status >= 500
        ? STATUS_MESSAGES[500]
        : `Error inesperado de la API de inventario (${status}).`);
}
/** Build a readable ApiError from the real FastAPI error body: `{detail: string}` or `{detail: [{loc, msg}]}`. */
export async function parseErrorResponse(response) {
    const status = response.status;
    let payload = null;
    try {
        payload = await response.json();
    }
    catch {
        // Non-JSON body (proxy error page, empty 500): fall back to the status message.
    }
    const detail = payload !== null && typeof payload === 'object' ? payload.detail : undefined;
    if (typeof detail === 'string' && detail.trim()) {
        return new ApiError(status, detail);
    }
    if (Array.isArray(detail)) {
        const fieldErrors = {};
        const messages = [];
        for (const issue of detail) {
            const msg = typeof issue?.msg === 'string' ? issue.msg.replace(/^Value error, /, '') : 'Valor no válido';
            const path = Array.isArray(issue?.loc) ? issue.loc.filter(part => part !== 'body').map(String) : [];
            const field = path[0];
            if (field && !fieldErrors[field])
                fieldErrors[field] = msg;
            messages.push(field ? `${field}: ${msg}` : msg);
        }
        return new ApiError(status, messages.length ? messages.join('; ') : fallbackMessage(status), fieldErrors);
    }
    return new ApiError(status, fallbackMessage(status));
}
export function createInventoryApi(options) {
    const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    const base = options.apiBase.replace(/\/+$/, '');
    async function request(method, path, body) {
        const authorization = options.getAuthorizationHeader();
        if (!authorization) {
            options.onUnauthorized?.();
            throw new ApiError(401, STATUS_MESSAGES[401]);
        }
        const headers = { Accept: 'application/json', Authorization: authorization };
        if (body !== undefined)
            headers['Content-Type'] = 'application/json';
        let response;
        try {
            response = await fetcher(`${base}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        }
        catch {
            throw new ApiError(0, 'No se pudo conectar con la API de inventario. Comprueba tu conexión e inténtalo de nuevo.');
        }
        if (!response.ok) {
            const error = await parseErrorResponse(response);
            if (response.status === 401)
                options.onUnauthorized?.();
            throw error;
        }
        return await response.json();
    }
    return {
        listProducts: () => request('GET', '/inventory/products'),
        createInboundOrder: order => request('POST', '/inventory/orders/inbound', order),
        createOutboundOrder: order => request('POST', '/inventory/orders/outbound', order),
        listOrders: () => request('GET', '/inventory/orders'),
    };
}
