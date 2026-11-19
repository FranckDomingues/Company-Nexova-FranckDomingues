import type { ViewContext } from '../context.js';
import { PATHS } from '../context.js';
import { h, UI } from '../dom.js';
import { ApiError, type Asset } from '../lib/inventory.js';
import { LOW_STOCK_THRESHOLD, STOCK_LEVEL_META, stockLevel } from '../stock.js';
import { TERMS, categoryLabel } from '../terms.js';

export function stockBadge(currentStock: number): HTMLSpanElement {
  const level = stockLevel(currentStock);
  const meta = STOCK_LEVEL_META[level];
  return h('span', { className: `inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`, dataset: { stockLevel: level } }, meta.label);
}

export function pageHeader(eyebrow: string, title: string, description: string): HTMLElement {
  return h('div', {},
    h('p', { className: 'text-sm font-semibold uppercase tracking-wider text-sky-700' }, eyebrow),
    h('h1', { className: 'mt-1 text-3xl font-bold tracking-tight' }, title),
    h('p', { className: 'mt-2 max-w-2xl text-slate-600' }, description));
}

function productRow(asset: Asset): HTMLTableRowElement {
  const level = stockLevel(asset.current_stock);
  const query = `?asset_id=${encodeURIComponent(String(asset.id))}`;
  return h('tr', { dataset: { assetId: String(asset.id), stockLevel: level }, className: level === 'out' ? 'bg-rose-50/40' : '' },
    h('td', { className: 'px-4 py-4' },
      h('div', { className: 'font-semibold text-slate-900' }, asset.name),
      h('div', { className: 'mt-1 font-mono text-xs text-slate-500' }, asset.sku)),
    h('td', { className: 'px-4 py-4' }, categoryLabel(asset.category)),
    h('td', { className: 'whitespace-nowrap px-4 py-4' }, asset.office),
    h('td', { className: 'whitespace-nowrap px-4 py-4' },
      h('div', { className: 'flex items-center gap-2' },
        h('span', { className: 'text-lg font-bold tabular-nums', dataset: { currentStock: String(asset.current_stock) } }, asset.current_stock),
        stockBadge(asset.current_stock))),
    h('td', { className: 'whitespace-nowrap px-4 py-4' },
      h('div', { className: 'flex flex-wrap gap-2' },
        h('a', { href: `${PATHS.inbound}${query}`, 'data-link': true, className: UI.secondary, 'aria-label': `${TERMS.registerInbound}: ${asset.name} (${asset.sku})`, dataset: { action: 'inbound' } }, `↓ ${TERMS.registerInbound}`),
        h('a', { href: `${PATHS.outbound}${query}`, 'data-link': true, className: UI.secondary, 'aria-label': `${TERMS.registerOutbound}: ${asset.name} (${asset.sku})`, dataset: { action: 'outbound' } }, `↑ ${TERMS.registerOutbound}`))),
  );
}

export async function renderProducts(ctx: ViewContext): Promise<void> {
  const status = h('div', { id: 'products-status', 'aria-live': 'polite', className: 'mt-5' });
  const body = h('tbody', { id: 'product-rows', className: 'divide-y divide-slate-100' });
  const table = h('section', { className: `mt-5 overflow-hidden ${UI.card}`, 'aria-labelledby': 'products-title' },
    h('h2', { id: 'products-title', className: 'sr-only' }, TERMS.assets),
    h('div', { className: 'overflow-x-auto' },
      h('table', { className: 'min-w-full divide-y divide-slate-200 text-left text-sm' },
        h('thead', { className: 'bg-slate-50 text-xs uppercase tracking-wide text-slate-600' },
          h('tr', {}, ...[`${TERMS.asset} / ${TERMS.sku}`, 'Categoría', TERMS.office, TERMS.currentStock, 'Acciones'].map(label => h('th', { scope: 'col', className: 'px-4 py-3' }, label)))),
        body)));
  const legend = h('p', { className: 'mt-4 text-xs text-slate-500' },
    `Indicadores: “Sin stock” = 0 unidades · “Stock bajo” = 1–${LOW_STOCK_THRESHOLD} unidades · “Disponible” = más de ${LOW_STOCK_THRESHOLD}. El stock se calcula como entradas − salidas.`);
  ctx.root.append(
    h('div', { className: 'flex flex-wrap items-end justify-between gap-4' },
      pageHeader('Operaciones · IT', 'Activos en inventario', 'Equipos y materiales de las oficinas de Valencia y Miami con su stock actual.'),
      h('div', { className: 'flex gap-2' },
        h('a', { href: PATHS.inbound, 'data-link': true, className: UI.primary + ' inline-flex items-center' }, `+ ${TERMS.registerInbound}`))),
    status, table, legend);

  async function load(): Promise<void> {
    status.replaceChildren();
    body.replaceChildren(h('tr', {}, h('td', { colspan: 5, className: 'px-4 py-8 text-center text-slate-500', dataset: { state: 'loading' } }, 'Cargando activos…')));
    try {
      const assets = await ctx.api.listProducts();
      if (!assets.length) {
        body.replaceChildren(h('tr', {}, h('td', { colspan: 5, className: 'px-4 py-8 text-center text-slate-500', dataset: { state: 'empty' } }, 'No hay activos registrados en el inventario.')));
        return;
      }
      body.replaceChildren(...assets.map(productRow));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      body.replaceChildren();
      status.replaceChildren(h('div', { role: 'alert', className: UI.error, dataset: { state: 'error' } },
        h('span', {}, `No se pudieron cargar los activos: ${error instanceof Error ? error.message : String(error)} `),
        h('button', { type: 'button', className: 'ml-2 font-semibold underline', onClick: () => { void load(); } }, 'Reintentar')));
    }
  }
  await load();
}
