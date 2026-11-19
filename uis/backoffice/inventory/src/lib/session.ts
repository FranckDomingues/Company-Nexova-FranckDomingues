/**
 * Structural types for the single NexovaAuth module (uis/backoffice/suppliers/src/auth-session.ts),
 * loaded as a classic script before this app. There is no second auth system: login, registration,
 * token persistence (localStorage key `nexova.auth.token`) and session verification (GET /auth/me) all
 * live in that module. tests/live.integration.test.ts proves the real module satisfies these types.
 */
export interface AuthProfile {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  [key: string]: unknown;
}

export interface AuthAccount {
  email: string;
  role: string;
  profile?: AuthProfile;
}

export interface RegistrationInput {
  email: string;
  password: string;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface AuthErrorLike extends Error {
  status: number;
  fieldErrors: Record<string, string>;
  code?: string;
}

export interface AuthSession {
  readonly account: AuthAccount | null;
  getAuthorizationHeader(): string | null;
  isVerified(): boolean;
  verify(options?: { force?: boolean }): Promise<AuthAccount | null>;
  login(input: { username: string; password: string }): Promise<unknown>;
  register(input: RegistrationInput): Promise<unknown>;
  logout(): void;
}

export interface NexovaAuthModule {
  TOKEN_STORAGE_KEY: string;
  validateLoginInput(username: unknown, password: unknown): string | null;
  validateRegistrationInput(input: Partial<RegistrationInput>): Record<string, string>;
  validateProfileFields(input: { name?: string | null; phone?: string | null; address?: string | null }): Record<string, string>;
  createAuthSession(options: { apiBase: string }): AuthSession;
}

export function isAuthError(error: unknown): error is AuthErrorLike {
  return error instanceof Error && typeof (error as Partial<AuthErrorLike>).status === 'number' &&
    typeof (error as Partial<AuthErrorLike>).fieldErrors === 'object';
}

export function getNexovaAuth(win: Window & { NexovaAuth?: NexovaAuthModule }): NexovaAuthModule {
  if (!win.NexovaAuth) throw new Error('NexovaAuth no está cargado: incluye suppliers/dist/auth-session.js antes del módulo de inventario.');
  return win.NexovaAuth;
}
