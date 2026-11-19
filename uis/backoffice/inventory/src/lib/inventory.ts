/**
 * Centralized Nexova inventory API client.
 *
 * Every inventory request in the backoffice goes through this module (over the shared authenticated
 * client in ./http.ts); UI views never call `fetch` directly. Types mirror `services/api/app/inventory_schemas.py` exactly.
 */
import { createApiClient, type ApiClientOptions } from './http.js';

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

export { ApiError, parseErrorResponse } from './http.js';

/** Same options as the shared client (lib/http.ts): Bearer from NexovaAuth, `onUnauthorized` on 401. */
export type InventoryApiOptions = ApiClientOptions;

export interface InventoryApi {
  listProducts(): Promise<Asset[]>;
  createInboundOrder(order: AssetEntryCreate): Promise<AssetEntry>;
  createOutboundOrder(order: AssetExitCreate): Promise<AssetExit>;
  listOrders(): Promise<InventoryOrder[]>;
}

export function createInventoryApi(options: InventoryApiOptions): InventoryApi {
  const { request } = createApiClient(options);
  return {
    listProducts: () => request<Asset[]>('GET', '/inventory/products'),
    createInboundOrder: order => request<AssetEntry>('POST', '/inventory/orders/inbound', order),
    createOutboundOrder: order => request<AssetExit>('POST', '/inventory/orders/outbound', order),
    listOrders: () => request<InventoryOrder[]>('GET', '/inventory/orders'),
  };
}
