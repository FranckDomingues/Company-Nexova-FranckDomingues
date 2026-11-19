/**
 * Centralized Nexova inventory API client.
 *
 * Every inventory request in the backoffice goes through this module; UI views never call
 * `fetch` directly. Types mirror `services/api/app/inventory_schemas.py` exactly.
 */

export type Category = 'hardware' | 'peripherals' | 'office_supplies' | 'training_materials';
export type Office = 'Valencia' | 'Miami';
export type ExitType = 'allocation' | 'consumption';

/** `AssetResponse` — GET /inventory/products */
export interface Asset {
  id: number;
  name: string;
  sku: string;
  category: Category;
  office: Office;
  current_stock: number;
}

/** `AssetEntryCreate` — POST /inventory/orders/inbound */
export interface AssetEntryCreate {
  asset_id: number;
  quantity: number;
  supplier: string;
  office: Office;
}

/** `AssetExitCreate` — POST /inventory/orders/outbound */
export interface AssetExitCreate {
  asset_id: number;
  quantity: number;
  exit_type: ExitType;
  assigned_to: string | null;
  office: Office;
}

/** `AssetEntryResponse` */
export interface AssetEntry {
  id: number;
  asset_id: number;
  quantity: number;
  supplier: string;
  office: Office;
  created_at: string;
  user_uuid: string;
}

/** `AssetExitResponse` */
export interface AssetExit {
  id: number;
  asset_id: number;
  quantity: number;
  exit_type: ExitType;
  assigned_to: string | null;
  office: Office;
  created_at: string;
  user_uuid: string;
}

/** `InventoryOrderResponse` — GET /inventory/orders */
export interface InventoryOrder {
  kind: 'inbound' | 'outbound';
  id: number;
  asset_id: number;
  asset_name: string;
  asset_sku: string;
  quantity: number;
  office: Office;
  created_at: string;
  user_uuid: string;
  supplier?: string | null;
  exit_type?: ExitType | null;
  assigned_to?: string | null;
}

/** FastAPI validation error item (HTTP 422). */
interface ValidationIssue {
  loc?: unknown[];
  msg?: unknown;
}

/** Status 0 means the request never reached the API (network/CORS failure). */
export class ApiError extends Error {
  readonly status: number;
  /** Field-level messages keyed by request body field (from FastAPI 422 `loc`). */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'La solicitud no es válida.',
  401: 'Tu sesión no es válida o ha caducado. Inicia sesión de nuevo.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  409: 'El registro ya existe.',
  422: 'Revisa los datos del formulario.',
  500: 'Error interno del servidor de inventario. Inténtalo de nuevo más tarde.',
};

function fallbackMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? (status >= 500
    ? STATUS_MESSAGES[500]
    : `Error inesperado de la API de inventario (${status}).`);
}

/** Build a readable ApiError from the real FastAPI error body: `{detail: string}` or `{detail: [{loc, msg}]}`. */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const status = response.status;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body (proxy error page, empty 500): fall back to the status message.
  }
  const detail = payload !== null && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : undefined;
  if (typeof detail === 'string' && detail.trim()) {
    return new ApiError(status, detail);
  }
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    const messages: string[] = [];
    for (const issue of detail as ValidationIssue[]) {
      const msg = typeof issue?.msg === 'string' ? issue.msg.replace(/^Value error, /, '') : 'Valor no válido';
      const path = Array.isArray(issue?.loc) ? issue.loc.filter(part => part !== 'body').map(String) : [];
      const field = path[0];
      if (field && !fieldErrors[field]) fieldErrors[field] = msg;
      messages.push(field ? `${field}: ${msg}` : msg);
    }
    return new ApiError(status, messages.length ? messages.join('; ') : fallbackMessage(status), fieldErrors);
  }
  return new ApiError(status, fallbackMessage(status));
}

export interface InventoryApiOptions {
  apiBase: string;
  /** Returns `Bearer <token>` from the existing NexovaAuth session, or null when signed out/expired. */
  getAuthorizationHeader: () => string | null;
  /** Called on HTTP 401 (or missing session) so the app can route through the existing login flow. */
  onUnauthorized?: () => void;
  fetcher?: typeof fetch;
}

export interface InventoryApi {
  listProducts(): Promise<Asset[]>;
  createInboundOrder(order: AssetEntryCreate): Promise<AssetEntry>;
  createOutboundOrder(order: AssetExitCreate): Promise<AssetExit>;
  listOrders(): Promise<InventoryOrder[]>;
}

export function createInventoryApi(options: InventoryApiOptions): InventoryApi {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const base = options.apiBase.replace(/\/+$/, '');

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const authorization = options.getAuthorizationHeader();
    if (!authorization) {
      options.onUnauthorized?.();
      throw new ApiError(401, STATUS_MESSAGES[401]);
    }
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: authorization };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await fetcher(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con la API de inventario. Comprueba tu conexión e inténtalo de nuevo.');
    }
    if (!response.ok) {
      const error = await parseErrorResponse(response);
      if (response.status === 401) options.onUnauthorized?.();
      throw error;
    }
    return await response.json() as T;
  }

  return {
    listProducts: () => request<Asset[]>('GET', '/inventory/products'),
    createInboundOrder: order => request<AssetEntry>('POST', '/inventory/orders/inbound', order),
    createOutboundOrder: order => request<AssetExit>('POST', '/inventory/orders/outbound', order),
    listOrders: () => request<InventoryOrder[]>('GET', '/inventory/orders'),
  };
}
