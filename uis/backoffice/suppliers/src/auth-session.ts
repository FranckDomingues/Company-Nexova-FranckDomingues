/**
 * NexovaAuth — the single client-side authentication module for every private Nexova backoffice view
 * (inventory SPA and supplier directory). AUTH-02:
 *   - POST /auth/login (OAuth2 form) → JWT persisted in localStorage under TOKEN_STORAGE_KEY
 *   - POST /users (registration) → POST /auth/login with the same credentials
 *   - GET /auth/me validates the stored token against the API (the backend is the authority;
 *     the JWT `exp` claim is only used to discard obviously expired tokens early)
 *
 * Security note: the assignment requires localStorage. Any script running on the backoffice origin
 * (XSS) can read it, so the token is never logged, never rendered and never placed in URLs, and views
 * build DOM with text nodes only. See docs/evidence/AUTH-02-CHECKLIST.md.
 */
export const TOKEN_STORAGE_KEY = 'nexova.auth.token';

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegistrationInput {
  email: string;
  password: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface CurrentAccount {
  email: string;
  role: string;
  profile: Record<string, unknown>;
}

/** Storage of the raw JWT. Browser-only; on the server (no window) or with blocked storage it degrades to memory. */
export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export interface AuthSessionOptions {
  apiBase: string;
  fetcher?: typeof fetch;
  now?: () => number;
  store?: TokenStore;
}

/** status 0 = the API was unreachable. `fieldErrors` is keyed by request field (email, password, name…). */
export class AuthError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  readonly code?: string;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PROFILE_LIMITS = { name: 200, phone: 50, address: 500 } as const;
export const PASSWORD_LIMITS = { min: 8, max: 128 } as const;
const RESET_LINK_INVALID = 'El enlace para restablecer la contraseña no es válido, ya se usó o ha caducado.';
const UNREACHABLE = 'No se pudo conectar con la API de Nexova. Comprueba tu conexión e inténtalo de nuevo.';

export function validateLoginInput(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !username.trim()) return 'Introduce tu correo electrónico.';
  if (!EMAIL_PATTERN.test(username.trim())) return 'Introduce un correo electrónico válido.';
  if (typeof password !== 'string' || password.length === 0) return 'Introduce tu contraseña.';
  return null;
}

/** Mirrors services/api UserRegistration: email, password 8–128, optional name ≤200, phone ≤50, address ≤500. */
export function validateRegistrationInput(input: Partial<RegistrationInput>): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  if (!email) errors.email = 'Introduce tu correo electrónico.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Introduce un correo electrónico válido.';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) errors.password = 'Introduce una contraseña.';
  else if (password.length < PASSWORD_LIMITS.min || password.length > PASSWORD_LIMITS.max) {
    errors.password = `La contraseña debe tener entre ${PASSWORD_LIMITS.min} y ${PASSWORD_LIMITS.max} caracteres.`;
  }
  Object.assign(errors, validateProfileFields(input));
  return errors;
}

/**
 * AUTH-03: new password + confirmation, mirroring the API policy (8–128 characters).
 * Returns field errors keyed `new_password` / `confirm_password`.
 */
export function validateNewPassword(password: unknown, confirmation: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  const value = typeof password === 'string' ? password : '';
  if (!value) errors.new_password = 'Introduce la nueva contraseña.';
  else if (value.length < PASSWORD_LIMITS.min || value.length > PASSWORD_LIMITS.max) {
    errors.new_password = `La contraseña debe tener entre ${PASSWORD_LIMITS.min} y ${PASSWORD_LIMITS.max} caracteres.`;
  }
  if (typeof confirmation !== 'string' || !confirmation) errors.confirm_password = 'Repite la nueva contraseña.';
  else if (value && confirmation !== value) errors.confirm_password = 'Las contraseñas no coinciden.';
  return errors;
}

/** Mirrors services/api ProfileFields (all optional, trimmed, max lengths). */
export function validateProfileFields(input: { name?: string | null; phone?: string | null; address?: string | null }): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ['name', 'phone', 'address'] as const) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > PROFILE_LIMITS[key]) errors[key] = `Máximo ${PROFILE_LIMITS[key]} caracteres.`;
  }
  return errors;
}

/** Spanish, field-specific messages for FastAPI 422 items; unknown fields keep the API text. */
const FIELD_MESSAGES: Record<string, string> = {
  email: 'Introduce un correo electrónico válido.',
  password: `La contraseña debe tener entre ${PASSWORD_LIMITS.min} y ${PASSWORD_LIMITS.max} caracteres.`,
  new_password: `La contraseña debe tener entre ${PASSWORD_LIMITS.min} y ${PASSWORD_LIMITS.max} caracteres.`,
  name: `Máximo ${PROFILE_LIMITS.name} caracteres.`,
  phone: `Máximo ${PROFILE_LIMITS.phone} caracteres.`,
  address: `Máximo ${PROFILE_LIMITS.address} caracteres.`,
};

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

/**
 * localStorage-backed store. Every access is guarded: during SSR/prerender there is no `window`, and
 * browsers may throw on storage access (privacy modes, quota). In those cases the token lives in memory only.
 */
export function createTokenStore(storage?: Storage | null): TokenStore {
  let memory: string | null = null;
  const resolve = (): Storage | null => {
    if (storage !== undefined) return storage;
    try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
  };
  return {
    get() {
      const target = resolve();
      if (target) { try { return target.getItem(TOKEN_STORAGE_KEY); } catch { /* fall back to memory */ } }
      return memory;
    },
    set(token: string) {
      memory = token;
      const target = resolve();
      if (target) { try { target.setItem(TOKEN_STORAGE_KEY, token); } catch { /* memory only */ } }
    },
    clear() {
      memory = null;
      const target = resolve();
      if (target) { try { target.removeItem(TOKEN_STORAGE_KEY); } catch { /* nothing persisted */ } }
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

async function responseError(response: Response, fallback: string): Promise<AuthError> {
  const payload = await readJson(response);
  const detail = payload !== null && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : undefined;
  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of detail as { loc?: unknown; msg?: unknown }[]) {
      const loc = Array.isArray(issue?.loc) ? issue.loc.filter(part => part !== 'body').map(String) : [];
      const field = loc[0];
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = FIELD_MESSAGES[field] ?? (typeof issue?.msg === 'string' ? issue.msg : 'Valor no válido.');
      }
    }
    return new AuthError(response.status, 'Revisa los campos marcados.', fieldErrors);
  }
  return new AuthError(response.status, typeof detail === 'string' && detail.trim() ? detail : `${fallback} (HTTP ${response.status})`);
}

const LOGIN_MESSAGES: Record<string, string> = {
  'Incorrect email or password': 'Correo electrónico o contraseña incorrectos.',
  'Inactive account': 'Esta cuenta está desactivada. Contacta con un administrador.',
};

function isCurrentAccount(value: unknown): value is CurrentAccount {
  const account = value as Partial<CurrentAccount> | null;
  return !!account && typeof account.email === 'string' && typeof account.role === 'string' &&
    account.profile !== null && typeof account.profile === 'object' && !Array.isArray(account.profile);
}

export function createAuthSession(options: AuthSessionOptions) {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = options.now ?? (() => Date.now() / 1000);
  const store = options.store ?? createTokenStore();
  const base = options.apiBase.replace(/\/+$/, '');
  /** The token whose validity GET /auth/me confirmed during this page load, and its account. */
  let verifiedToken: string | null = null;
  let account: CurrentAccount | null = null;
  let pending: { token: string; promise: Promise<CurrentAccount | null> } | null = null;

  function clear(): void {
    store.clear();
    verifiedToken = null;
    account = null;
    pending = null;
  }

  /** Current usable token: present, well-formed and not past its `exp` claim (otherwise it is removed). */
  function currentToken(): string | null {
    const token = store.get();
    if (!token) {
      if (verifiedToken) { verifiedToken = null; account = null; }
      return null;
    }
    if (isTokenExpired(token, now())) {
      clear();
      return null;
    }
    return token;
  }

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(`${base}${path}`, init);
    } catch {
      throw new AuthError(0, UNREACHABLE);
    }
  }

  async function fetchAccount(token: string): Promise<CurrentAccount | null> {
    const response = await send('/auth/me', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
    if (response.status === 401) return null;
    if (!response.ok) throw await responseError(response, 'No se pudo verificar la sesión');
    const current = await readJson(response);
    if (!isCurrentAccount(current)) throw new AuthError(response.status, 'La respuesta de la cuenta no tiene un formato válido.');
    return current;
  }

  const session = {
    get account(): CurrentAccount | null {
      return currentToken() !== null && verifiedToken === store.get() ? account : null;
    },

    getAuthorizationHeader(): string | null {
      const token = currentToken();
      return token ? `Bearer ${token}` : null;
    },

    /** True only when GET /auth/me accepted the current token during this page load. */
    isVerified(): boolean {
      const token = currentToken();
      return token !== null && token === verifiedToken;
    },

    /**
     * Validate the stored token with the API (GET /auth/me). Returns the account, or null when there is no
     * token or the API rejects it with 401 (the token is then removed). Other failures (network, 5xx, 403)
     * throw an AuthError and keep the token: they say nothing about the token's validity.
     */
    async verify(verifyOptions: { force?: boolean } = {}): Promise<CurrentAccount | null> {
      const token = currentToken();
      if (!token) return null;
      if (!verifyOptions.force && token === verifiedToken && account) return account;
      if (pending && pending.token === token) return pending.promise;
      const promise = (async () => {
        try {
          const current = await fetchAccount(token);
          if (store.get() !== token) return null; // logged out or replaced meanwhile
          if (!current) { clear(); return null; }
          verifiedToken = token;
          account = current;
          return current;
        } finally {
          if (pending?.token === token) pending = null;
        }
      })();
      pending = { token, promise };
      return promise;
    },

    async login(input: LoginInput): Promise<CurrentAccount> {
      const validationError = validateLoginInput(input?.username, input?.password);
      if (validationError) throw new AuthError(422, validationError);
      clear();
      const form = new URLSearchParams({ username: input.username.trim(), password: input.password });
      // Unauthenticated endpoint: a 401 here is a wrong password, never a session expiry (no redirect).
      const tokenResponse = await send('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
      });
      if (!tokenResponse.ok) {
        const error = await responseError(tokenResponse, 'No se pudo iniciar sesión');
        if (tokenResponse.status === 401) {
          throw new AuthError(401, LOGIN_MESSAGES[error.message] ?? 'Correo electrónico o contraseña incorrectos.');
        }
        throw error;
      }
      const tokenPayload = await readJson(tokenResponse) as { access_token?: unknown; token_type?: unknown } | null;
      const token = tokenPayload?.access_token;
      if (typeof token !== 'string' || !token ||
          (tokenPayload?.token_type !== undefined && String(tokenPayload.token_type).toLowerCase() !== 'bearer')) {
        throw new AuthError(tokenResponse.status, 'La respuesta de autenticación no contiene un token Bearer válido.');
      }
      if (isTokenExpired(token, now())) throw new AuthError(tokenResponse.status, 'El token recibido ha expirado o no es válido.');
      const current = await fetchAccount(token);
      if (!current) throw new AuthError(401, 'La API rechazó el token recién emitido. Inténtalo de nuevo.');
      store.set(token);
      verifiedToken = token;
      account = current;
      return current;
    },

    /** POST /users with the backend's exact contract, then POST /auth/login with the same credentials. */
    async register(input: RegistrationInput): Promise<CurrentAccount> {
      const fieldErrors = validateRegistrationInput(input);
      if (Object.keys(fieldErrors).length) throw new AuthError(422, 'Revisa los campos marcados.', fieldErrors);
      clear();
      const email = input.email.trim();
      const body: Record<string, string> = { email, password: input.password };
      for (const key of ['name', 'phone', 'address'] as const) {
        const value = input[key]?.trim();
        if (value) body[key] = value;
      }
      const response = await send('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        throw new AuthError(409, 'Ya existe una cuenta con este correo electrónico.', { email: 'Este correo ya está registrado. Inicia sesión o usa otro.' });
      }
      if (!response.ok) throw await responseError(response, 'No se pudo crear la cuenta');
      try {
        return await session.login({ username: email, password: input.password });
      } catch (error) {
        throw new AuthError(error instanceof AuthError ? error.status : 0,
          `Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente: ${(error as Error).message} Inicia sesión manualmente.`,
          {}, 'REGISTERED_LOGIN_FAILED');
      }
    },

    /**
     * AUTH-03: POST /auth/forgot-password. The API answers 200 whether or not the address exists, so a
     * resolved promise only means "request accepted"; callers must show a generic confirmation.
     */
    async requestPasswordReset(email: string): Promise<void> {
      const trimmed = typeof email === 'string' ? email.trim() : '';
      if (!EMAIL_PATTERN.test(trimmed)) {
        throw new AuthError(422, 'Introduce un correo electrónico válido.', { email: 'Introduce un correo electrónico válido.' });
      }
      const response = await send('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (response.status === 429) throw new AuthError(429, 'Has hecho demasiadas solicitudes. Espera un rato e inténtalo de nuevo.');
      if (!response.ok) throw await responseError(response, 'No se pudo enviar la solicitud');
    },

    /** AUTH-03: POST /auth/reset-password. HTTP 400 = invalid, expired or already-used link. */
    async resetPassword(token: string, newPassword: string): Promise<void> {
      if (!token) throw new AuthError(400, RESET_LINK_INVALID, {}, 'INVALID_RESET_TOKEN');
      const fieldErrors = validateNewPassword(newPassword, newPassword);
      if (Object.keys(fieldErrors).length) throw new AuthError(422, 'Revisa los campos marcados.', fieldErrors);
      const response = await send('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (response.status === 400) throw new AuthError(400, RESET_LINK_INVALID, {}, 'INVALID_RESET_TOKEN');
      if (!response.ok) throw await responseError(response, 'No se pudo restablecer la contraseña');
    },

    /** Removes the token from storage and memory. */
    logout(): void { clear(); },
  };
  return session;
}

export type AuthSession = ReturnType<typeof createAuthSession>;

export const NexovaAuth = {
  TOKEN_STORAGE_KEY,
  AuthError,
  validateLoginInput,
  validateRegistrationInput,
  validateProfileFields,
  validateNewPassword,
  getTokenExpiration,
  isTokenExpired,
  createTokenStore,
  createAuthSession,
};

declare global {
  interface Window { NexovaAuth: typeof NexovaAuth; }
}

if (typeof window !== 'undefined') window.NexovaAuth = NexovaAuth;
