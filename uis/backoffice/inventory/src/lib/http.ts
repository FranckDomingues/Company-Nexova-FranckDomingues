/**
 * The one authenticated HTTP abstraction of the backoffice SPA (AUTH02-08 / AUTH02-10).
 *
 * Every protected API call (inventory, profile) goes through `createApiClient`, which:
 *   - attaches `Authorization: Bearer <token>` from the NexovaAuth session;
 *   - never sends a protected request without a token (calls `onUnauthorized` instead);
 *   - on HTTP 401 calls `onUnauthorized` exactly once per response so the app clears the session and
 *     routes to login. 403 is a permissions error and is surfaced to the view, never treated as 401.
 * Unauthenticated endpoints (POST /auth/login, POST /users) are owned by NexovaAuth and never reach this
 * client, so a failed login cannot trigger the session-expiry redirect.
 */

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

export const STATUS_MESSAGES: Record<number, string> = {
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

export interface ApiClientOptions {
  apiBase: string;
  /** Returns `Bearer <token>` from the NexovaAuth session, or null when signed out/expired. */
  getAuthorizationHeader: () => string | null;
  /**
   * Called on HTTP 401 (or missing session) so the app can clear the session and route to login.
   * Receives the Authorization header that was rejected (null when no token was available), so a late
   * 401 for an older token cannot sign out a newer session.
   */
  onUnauthorized?: (rejectedAuthorization: string | null) => void;
  fetcher?: typeof fetch;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const base = options.apiBase.replace(/\/+$/, '');

  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const authorization = options.getAuthorizationHeader();
    if (!authorization) {
      options.onUnauthorized?.(null);
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
      if (response.status === 401) options.onUnauthorized?.(authorization);
      throw error;
    }
    return response.status === 204 ? (undefined as T) : await response.json() as T;
  }

  return { request };
}
