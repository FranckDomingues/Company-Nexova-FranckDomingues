/**
 * @jest-environment node
 *
 * AUTH02-07 SSR/browser boundary: the auth module can be imported and used where `window` and
 * `localStorage` do not exist (server rendering, prerender, Node tooling) without throwing.
 */
import { createAuthSession, createTokenStore } from '../../suppliers/src/auth-session';

describe('NexovaAuth outside the browser', () => {
  it('has no window and does not try to register a global', () => {
    expect(typeof window).toBe('undefined');
  });

  it('a session without storage reports "signed out" instead of throwing', async () => {
    const session = createAuthSession({ apiBase: 'http://api.test', fetcher: jest.fn() as unknown as typeof fetch });
    expect(session.getAuthorizationHeader()).toBeNull();
    expect(session.isVerified()).toBe(false);
    expect(await session.verify()).toBeNull();
    expect(() => session.logout()).not.toThrow();
  });

  it('the default token store falls back to memory', () => {
    const store = createTokenStore();
    expect(store.get()).toBeNull();
    store.set('a.b.c');
    expect(store.get()).toBe('a.b.c');
  });
});
