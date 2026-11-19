export interface LoginInput {
  username: string;
  password: string;
}

export interface CurrentAccount {
  email: string;
  role: string;
  profile: Record<string, unknown>;
}

export interface AuthSessionOptions {
  apiBase: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

export function validateLoginInput(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !username.trim()) return 'Introduce tu correo electrónico.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim())) return 'Introduce un correo electrónico válido.';
  if (typeof password !== 'string' || password.length === 0) return 'Introduce tu contraseña.';
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3 || !segments[1] || !/^[A-Za-z0-9_-]+$/.test(segments[1])) return null;
  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(segments[1].length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** Returns the JWT exp claim in seconds; it is advisory and never verifies the token. */
export function getTokenExpiration(token: string): number | null {
  const expiration = decodeJwtPayload(token)?.exp;
  return typeof expiration === 'number' && Number.isFinite(expiration) ? expiration : null;
}

/** Treats malformed or non-expiring tokens as expired; the API remains authoritative. */
export function isTokenExpired(token: string, nowSeconds: number = Date.now() / 1000): boolean {
  const expiration = getTokenExpiration(token);
  return expiration === null || !Number.isFinite(nowSeconds) || expiration <= nowSeconds;
}

async function responseError(response: Response): Promise<Error> {
  let detail = `Error de autenticación (${response.status})`;
  try {
    const payload = await response.json() as { detail?: unknown };
    if (typeof payload.detail === 'string') detail = payload.detail;
  } catch { /* A non-JSON response still has a useful status-based error. */ }
  return new Error(detail);
}

export function createAuthSession(options: AuthSessionOptions) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => Date.now() / 1000);
  let accessToken: string | null = null;
  let account: CurrentAccount | null = null;

  function clear(): void {
    accessToken = null;
    account = null;
  }

  return {
    get account(): CurrentAccount | null { return account; },

    getAuthorizationHeader(): string | null {
      if (!accessToken) return null;
      if (isTokenExpired(accessToken, now())) {
        clear();
        return null;
      }
      return `Bearer ${accessToken}`;
    },

    async login(input: LoginInput): Promise<CurrentAccount> {
      const validationError = validateLoginInput(input?.username, input?.password);
      if (validationError) throw new Error(validationError);
      clear();
      const form = new URLSearchParams({ username: input.username.trim(), password: input.password });
      const tokenResponse = await fetcher(`${options.apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!tokenResponse.ok) throw await responseError(tokenResponse);
      const tokenPayload = await tokenResponse.json() as { access_token?: unknown; token_type?: unknown };
      if (typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token ||
          (tokenPayload.token_type !== undefined && String(tokenPayload.token_type).toLowerCase() !== 'bearer')) {
        throw new Error('La respuesta de autenticación no contiene un token Bearer válido.');
      }
      if (isTokenExpired(tokenPayload.access_token, now())) throw new Error('El token recibido ha expirado o no es válido.');
      accessToken = tokenPayload.access_token;
      try {
        const accountResponse = await fetcher(`${options.apiBase}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!accountResponse.ok) throw await responseError(accountResponse);
        const current = await accountResponse.json() as Partial<CurrentAccount>;
        if (typeof current.email !== 'string' || typeof current.role !== 'string' ||
            current.profile === null || typeof current.profile !== 'object' || Array.isArray(current.profile)) {
          throw new Error('La respuesta de la cuenta no tiene un formato válido.');
        }
        account = current as CurrentAccount;
        return account;
      } catch (error) {
        clear();
        throw error;
      }
    },

    logout(): void { clear(); },
  };
}

export const NexovaAuth = { validateLoginInput, getTokenExpiration, isTokenExpired, createAuthSession };

declare global {
  interface Window { NexovaAuth: typeof NexovaAuth; }
}

if (typeof window !== 'undefined') window.NexovaAuth = NexovaAuth;
