import type { InventoryApi } from './lib/inventory.js';
import type { AuthSession, NexovaAuthModule } from './lib/session.js';

export const PATHS = {
  products: '/backoffice/inventory/products',
  inbound: '/backoffice/inventory/orders/inbound',
  outbound: '/backoffice/inventory/orders/outbound',
  orders: '/backoffice/inventory/orders',
  login: '/backoffice/login',
} as const;

export interface ViewContext {
  root: HTMLElement;
  api: InventoryApi;
  session: AuthSession;
  auth: NexovaAuthModule;
  params: URLSearchParams;
  navigate(to: string, options?: { replace?: boolean }): Promise<void>;
}

export type View = (ctx: ViewContext) => void | Promise<void>;
