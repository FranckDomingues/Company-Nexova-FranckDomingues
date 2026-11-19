/**
 * Stock indicator thresholds for Nexova IT/operations.
 *
 * - `out`  — current_stock <= 0: "Sin stock". Nothing can be allocated or consumed.
 * - `low`  — 1..LOW_STOCK_THRESHOLD (5): "Stock bajo". Roughly one onboarding wave in a
 *            single office; operations should reorder before the next hiring cycle.
 * - `ok`   — more than LOW_STOCK_THRESHOLD: "Disponible".
 *
 * Indicators are advisory only; the API remains authoritative for stock validation.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(currentStock: number): StockLevel {
  if (currentStock <= 0) return 'out';
  if (currentStock <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

export const STOCK_LEVEL_META: Record<StockLevel, { label: string; badgeClass: string }> = {
  out: { label: 'Sin stock', badgeClass: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200' },
  low: { label: 'Stock bajo', badgeClass: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200' },
  ok: { label: 'Disponible', badgeClass: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' },
};
