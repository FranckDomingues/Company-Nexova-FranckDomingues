import type { ViewContext } from '../context.js';
import { h, UI, formatDateTime } from '../dom.js';
import { ApiError, type Asset, type InventoryOrder } from '../lib/inventory.js';
import { EXIT_TYPE_LABELS, ORDER_KIND_LABELS, TERMS } from '../terms.js';
import { pageHeader } from './products.js';

/**
 * Product name for an order: the API's own `asset_name` (joined server-side), falling back
 * to GET /inventory/products by `asset_id`. Names are never invented.
 */
export function resolveAssetName(order: InventoryOrder, assetsById: Map<number, Asset>): { name: string; sku: string } {
  const asset = assetsById.get(order.asset_id);
  const name = order.asset_name || asset?.name;
  const sku = order.asset_sku || asset?.sku || '';
  return { name: name ?? `Activo #${order.asset_id} (sin datos)`, sku };
}

function detail(order: InventoryOrder): string {
  if (order.kind === 'inbound') return `${TERMS.supplier}: ${order.supplier ?? '—'}`;
  if (order.exit_type === 'allocation') return `${EXIT_TYPE_LABELS.allocation}: ${order.assigned_to ?? '—'}`;
  return order.exit_type ? EXIT_TYPE_LABELS[order.exit_type] : '—';
}

function orderRow(order: InventoryOrder, assetsById: Map<number, Asset>): HTMLTableRowElement {
  const inbound = order.kind === 'inbound';
  const { name, sku } = resolveAssetName(order, assetsById);
  return h('tr', { dataset: { kind: order.kind, orderId: `${order.kind}-${order.id}` }, className: inbound ? 'bg-emerald-50/30' : 'bg-amber-50/30' },
    h('td', { className: `whitespace-nowrap border-l-4 px-4 py-3 ${inbound ? 'border-l-emerald-500' : 'border-l-amber-500'}`, dataset: { kindAccent: order.kind } }, h('time', { datetime: order.created_at }, formatDateTime(order.created_at))),
    h('td', { className: 'whitespace-nowrap px-4 py-3' },
      h('span', { className: `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${inbound ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`, dataset: { kindBadge: order.kind } },
        inbound ? '↓' : '↑', ORDER_KIND_LABELS[order.kind])),
    h('td', { className: 'px-4 py-3' }, h('div', { className: 'font-semibold text-slate-900', dataset: { assetName: '' } }, name), sku ? h('div', { className: 'font-mono text-xs text-slate-500' }, sku) : null),
    h('td', { className: `whitespace-nowrap px-4 py-3 font-bold tabular-nums ${inbound ? 'text-emerald-700' : 'text-amber-800'}` }, `${inbound ? '+' : '−'}${order.quantity}`),
    h('td', { className: 'whitespace-nowrap px-4 py-3' }, order.office),
    h('td', { className: 'px-4 py-3 text-slate-600' }, detail(order)),
    h('td', { className: 'px-4 py-3' }, h('code', { className: 'break-all font-mono text-xs text-slate-600', dataset: { userUuid: '' } }, order.user_uuid)),
  );
}

/** Read-only audit trail of entradas and salidas: no edit or delete actions exist. */
export async function renderHistory(ctx: ViewContext): Promise<void> {
  const status = h('div', { id: 'history-status', 'aria-live': 'polite', className: 'mt-5' });
  const summary = h('p', { id: 'history-summary', className: 'mt-3 text-sm text-slate-500' });
  const body = h('tbody', { id: 'order-rows', className: 'divide-y divide-slate-100' });
  ctx.root.append(
    pageHeader('Inventario · Auditoría', TERMS.history, 'Registro de solo lectura de todas las entradas y salidas de activos, con el responsable que las registró.'),
    summary, status,
    h('section', { className: `mt-5 overflow-hidden ${UI.card}`, 'aria-labelledby': 'history-title' },
      h('h2', { id: 'history-title', className: 'sr-only' }, TERMS.history),
      h('div', { className: 'overflow-x-auto' },
        h('table', { className: 'min-w-full divide-y divide-slate-200 text-left text-sm' },
          h('thead', { className: 'bg-slate-50 text-xs uppercase tracking-wide text-slate-600' },
            h('tr', {}, ...[TERMS.createdAt, 'Tipo', `${TERMS.asset} / ${TERMS.sku}`, TERMS.quantity, TERMS.office, 'Detalle', TERMS.registeredBy].map(label => h('th', { scope: 'col', className: 'px-4 py-3' }, label)))),
          body))));

  body.replaceChildren(h('tr', {}, h('td', { colspan: 7, className: 'px-4 py-8 text-center text-slate-500', dataset: { state: 'loading' } }, 'Cargando órdenes…')));
  const [orders, products] = await Promise.allSettled([ctx.api.listOrders(), ctx.api.listProducts()]);
  if (orders.status === 'rejected') {
    const error = orders.reason;
    if (error instanceof ApiError && error.status === 401) return;
    body.replaceChildren();
    status.replaceChildren(h('div', { role: 'alert', className: UI.error, dataset: { state: 'error' } }, `No se pudo cargar el historial: ${error instanceof Error ? error.message : String(error)}`));
    return;
  }
  const assetsById = new Map((products.status === 'fulfilled' ? products.value : []).map(asset => [asset.id, asset] as const));
  const time = (o: InventoryOrder) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(o.created_at) ? o.created_at : `${o.created_at}Z`) || 0;
  const sorted = [...orders.value].sort((a, b) => time(b) - time(a) || b.id - a.id);
  if (!sorted.length) {
    body.replaceChildren(h('tr', {}, h('td', { colspan: 7, className: 'px-4 py-8 text-center text-slate-500', dataset: { state: 'empty' } }, 'Todavía no hay órdenes de entrada ni de salida.')));
    summary.textContent = '';
    return;
  }
  const inbound = sorted.filter(o => o.kind === 'inbound').length;
  summary.textContent = `${sorted.length} órdenes · ${inbound} entradas · ${sorted.length - inbound} salidas (más recientes primero)`;
  body.replaceChildren(...sorted.map(order => orderRow(order, assetsById)));
}
