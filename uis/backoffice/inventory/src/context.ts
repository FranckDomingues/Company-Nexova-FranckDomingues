import type { AccountApi } from './lib/account.js';
import type { InventoryApi } from './lib/inventory.js';
import type { AuthSession, NexovaAuthModule } from './lib/session.js';

export const PATHS = {
  products: '/backoffice/inventory/products',
  inbound: '/backoffice/inventory/orders/inbound',
  outbound: '/backoffice/inventory/orders/outbound',
  orders: '/backoffice/inventory/orders',
  profile: '/backoffice/account/profile',
  changePassword: '/backoffice/account/change-password',
  forgotPassword: '/backoffice/forgot-password',
  resetPassword: '/backoffice/reset-password',
  login: '/backoffice/login',
  register: '/backoffice/register',
  /** Supplier directory: a separate private page (uis/backoffice/index.html) with its own guard. */
  suppliers: '/backoffice/',
} as const;

export interface ViewContext {
  root: HTMLElement;
  api: InventoryApi;
  accountApi: AccountApi;
  session: AuthSession;
  auth: NexovaAuthModule;
  params: URLSearchParams;
  navigate(to: string, options?: { replace?: boolean }): Promise<void>;
  /** Go to a post-authentication destination (SPA route or the supplier directory page). */
  goTo(to: string): Promise<void>;
  /** Clear the session and route to login (reason 'session' = it expired/was rejected during use). */
  redirectToLogin(reason?: 'session'): Promise<void>;
}

export type View = (ctx: ViewContext) => void | Promise<void>;
