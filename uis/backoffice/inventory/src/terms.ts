/**
 * Nexova inventory vocabulary (docs/evidence/sources/nexova-BRIEFING.es.md):
 * an "entrada de activos" is a purchase/delivery received; a "salida de activos" is an
 * allocation to an employee ("asignación") or a consumption event ("consumo").
 */
import type { Category, ExitType, InventoryOrder } from './lib/inventory.js';

export const TERMS = {
  asset: 'Activo',
  assets: 'Activos',
  sku: 'SKU',
  currentStock: 'Stock actual',
  availableStock: 'Stock disponible',
  inbound: 'Entrada de activos',
  outbound: 'Salida de activos',
  registerInbound: 'Registrar entrada',
  registerOutbound: 'Registrar salida',
  history: 'Historial de órdenes',
  supplier: 'Proveedor',
  office: 'Oficina',
  quantity: 'Cantidad',
  assignedTo: 'Empleado asignado',
  exitType: 'Tipo de salida',
  registeredBy: 'Registrado por (UUID)',
  createdAt: 'Fecha',
} as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  hardware: 'Hardware',
  peripherals: 'Periféricos',
  office_supplies: 'Material de oficina',
  training_materials: 'Material de formación',
};

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  allocation: 'Asignación a empleado',
  consumption: 'Consumo',
};

export const ORDER_KIND_LABELS: Record<InventoryOrder['kind'], string> = {
  inbound: 'Entrada',
  outbound: 'Salida',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category] ?? category;
}
