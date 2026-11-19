/**
 * Adapter over the existing NexovaAuth module (uis/backoffice/suppliers/src/auth-session.ts).
 * No second login system: the token stays in that module's memory only (never in
 * localStorage/sessionStorage/cookies). A full page reload therefore requires signing in again.
 */
export interface AuthAccount {
  email: string;
  role: string;
}

export interface AuthSession {
  readonly account: AuthAccount | null;
  getAuthorizationHeader(): string | null;
  login(input: { username: string; password: string }): Promise<unknown>;
  logout(): void;
}

export interface NexovaAuthModule {
  validateLoginInput(username: unknown, password: unknown): string | null;
  createAuthSession(options: { apiBase: string }): AuthSession;
}

export function getNexovaAuth(win: Window & { NexovaAuth?: NexovaAuthModule }): NexovaAuthModule {
  if (!win.NexovaAuth) throw new Error('NexovaAuth no está cargado: incluye suppliers/dist/auth-session.js antes del módulo de inventario.');
  return win.NexovaAuth;
}
