/**
 * SIMULATED backend for AUTH-02 jsdom tests: mirrors the real FastAPI contracts in
 * services/api/app/routes/{authentication,users}.py (status codes, bodies, 401/403/409/422 shapes).
 * Tokens are fake JWT-shaped strings with unverifiable signatures — never real credentials.
 * Real-backend verification lives in tests/live.integration.test.ts and e2e/run-e2e.mjs.
 */
import { NexovaAuth } from '../../suppliers/src/auth-session';
import type { AuthSession } from '../src/lib/session';
import { ASSETS, ORDERS, type Call } from './helpers';

const b64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** JWT-shaped test token; `expInSeconds` relative to now (negative = already expired). */
export function fakeJwt(sub: string, expInSeconds = 3600, tag = 'sig'): string {
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + expInSeconds }))}.${tag}`;
}

export const KEY = NexovaAuth.TOKEN_STORAGE_KEY;
export const EMAIL = 'ana@nexova.example';
export const PASSWORD = 'test-only-password-1';

interface User { id: number; email: string; password: string; role: string; profile: { id: number; user_id: number; name: string | null; phone: string | null; address: string | null } }
type Reply = { status?: number; body?: unknown };

export function createAuthBackend(options: { role?: string } = {}) {
  const users = new Map<string, User>();
  const tokens = new Map<string, User>();
  const addUser = (email: string, password: string, profile: Partial<User['profile']> = {}) => {
    const id = users.size + 1;
    const user: User = { id, email, password, role: options.role ?? 'user', profile: { id, user_id: id, name: null, phone: null, address: null, ...profile } };
    users.set(email, user);
    return user;
  };
  const issue = (user: User) => {
    const token = fakeJwt(String(user.id), 3600, `sig${tokens.size}`);
    tokens.set(token, user);
    return token;
  };
  const seed = addUser(EMAIL, PASSWORD, { name: 'Ana Pérez', phone: '+34 600 111 222', address: 'Calle Colón 1, Valencia' });
  const validToken = issue(seed);
  const overrides: Record<string, (call: Call) => Reply | Promise<Reply>> = {};
  /** AUTH-03 reset links: raw token → state (the real API stores only a hash; irrelevant for the UI). */
  const resetTokens = new Map<string, { email: string; used: boolean; expired: boolean }>();
  const forgotRequests: string[] = [];
  const issueReset = (email = EMAIL, expired = false) => {
    const token = `reset-${resetTokens.size}-${Math.random().toString(36).slice(2)}`;
    resetTokens.set(token, { email, used: false, expired });
    return token;
  };

  const bearerUser = (call: Call): User | undefined => {
    const header = call.headers.Authorization ?? '';
    return header.startsWith('Bearer ') ? tokens.get(header.slice(7)) : undefined;
  };
  const unauthorized: Reply = { status: 401, body: { detail: 'Invalid or expired bearer token' } };

  const handler = async (call: Call): Promise<Reply> => {
    const key = `${call.method} ${new URL(call.url).pathname}`;
    if (overrides[key]) return overrides[key](call);
    const body = (call.body ?? {}) as Record<string, string | null | undefined>;
    switch (key) {
      case 'POST /auth/login': {
        const user = users.get(String(body.username ?? '').toLowerCase());
        if (!user || user.password !== body.password) return { status: 401, body: { detail: 'Incorrect email or password' } };
        return { body: { access_token: issue(user), token_type: 'bearer' } };
      }
      case 'GET /auth/me': {
        const user = bearerUser(call);
        return user ? { body: { email: user.email, role: user.role, profile: user.profile } } : unauthorized;
      }
      case 'POST /users': {
        const email = String(body.email ?? '').toLowerCase();
        if (String(body.password ?? '').length < 8) return { status: 422, body: { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'string_too_short' }] } };
        if (users.has(email)) return { status: 409, body: { detail: 'Email is already registered' } };
        const user = addUser(email, String(body.password), { name: body.name ?? null, phone: body.phone ?? null, address: body.address ?? null });
        return { status: 201, body: { id: user.id, email, is_active: true, role: user.role, created_at: '2026-11-18T12:00:00+00:00' } };
      }
      case 'PUT /profiles/me': {
        const user = bearerUser(call);
        if (!user) return unauthorized;
        Object.assign(user.profile, { name: body.name ?? null, phone: body.phone ?? null, address: body.address ?? null });
        return { body: user.profile };
      }
      case 'POST /auth/forgot-password': {
        const email = String(body.email ?? '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 422, body: { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] } };
        forgotRequests.push(email);
        if (users.has(email.toLowerCase())) issueReset(email.toLowerCase());
        return { body: { detail: 'If that address is registered, a password reset link has been sent.' } };
      }
      case 'POST /auth/reset-password': {
        const entry = resetTokens.get(String(body.token ?? ''));
        if (String(body.new_password ?? '').length < 8) return { status: 422, body: { detail: [{ loc: ['body', 'new_password'], msg: 'String should have at least 8 characters' }] } };
        if (!entry || entry.used || entry.expired) return { status: 400, body: { detail: 'Invalid or expired reset token' } };
        entry.used = true;
        users.get(entry.email)!.password = String(body.new_password);
        return { body: { detail: 'Password updated' } };
      }
      case 'POST /auth/change-password': {
        const user = bearerUser(call);
        if (!user) return unauthorized;
        if (body.current_password !== user.password) return { status: 400, body: { detail: 'Current password is incorrect' } };
        if (body.current_password === body.new_password) return { status: 400, body: { detail: 'New password must be different from the current password' } };
        user.password = String(body.new_password);
        return { body: { detail: 'Password updated' } };
      }
      case 'GET /inventory/products': return bearerUser(call) ? { body: ASSETS } : unauthorized;
      case 'GET /inventory/orders': return bearerUser(call) ? { body: ORDERS } : unauthorized;
      default: return { status: 404, body: { detail: 'Not Found' } };
    }
  };
  return { handler, overrides, users, tokens, validToken, revoke: (token: string) => tokens.delete(token), resetTokens, issueReset, forgotRequests };
}

/** The real NexovaAuth session, wired to the shared fetch mock (no fake session). */
export const realSession = (fetcher: typeof fetch): AuthSession => NexovaAuth.createAuthSession({ apiBase: 'http://api.test', fetcher });

export const pathOf = (call: Call) => `${call.method} ${new URL(call.url).pathname}`;
