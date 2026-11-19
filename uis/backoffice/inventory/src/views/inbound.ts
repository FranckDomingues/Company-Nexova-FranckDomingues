import type { ViewContext } from '../context.js';
import { PATHS } from '../context.js';
import { h, UI } from '../dom.js';
import { ApiError, type Asset } from '../lib/inventory.js';
import { TERMS } from '../terms.js';
import { pageHeader } from './products.js';
import { banner, field, fillProductSelect, parseQuantity, setFieldError } from './forms.js';

/** "Entrada de activos": a purchase or supplier delivery received by a Nexova office. */
export async function renderInbound(ctx: ViewContext): Promise<void> {
  let assets: Asset[] = [];
  let submitting = false;
  const status = h('div', { id: 'form-status', 'aria-live': 'polite', className: 'mt-5' });
  const asset = field('asset_id', TERMS.asset, h('select', { name: 'asset_id', required: true, className: UI.input }));
  const officeValue = h('output', { id: 'office', className: 'mt-1 flex min-h-11 items-center rounded-md border border-dashed border-slate-300 px-3 text-slate-700' }, '—');
  const quantity = field('quantity', `${TERMS.quantity} (unidades recibidas)`, h('input', { name: 'quantity', type: 'number', inputmode: 'numeric', min: '1', step: '1', required: true, className: UI.input }));
  const supplier = field('supplier', TERMS.supplier, h('input', { name: 'supplier', type: 'text', maxlength: '200', required: true, autocomplete: 'organization', className: UI.input }));
  const submit = h('button', { type: 'submit', className: UI.primary }, TERMS.registerInbound);
  const form = h('form', { id: 'inbound-form', className: 'mt-5 grid gap-4 sm:grid-cols-2', novalidate: true },
    asset.wrapper,
    h('div', {}, h('span', { className: UI.label }, `${TERMS.office} receptora`), officeValue,
      h('p', { className: 'mt-1 text-xs text-slate-500' }, 'Se toma del activo seleccionado; la API exige que coincidan.')),
    quantity.wrapper, supplier.wrapper,
    h('div', { className: 'sm:col-span-2' }, submit));

  ctx.root.append(
    pageHeader('Inventario · Entradas', TERMS.inbound, 'Registra una compra o entrega de proveedor recibida en una oficina de Nexova. El stock aumenta al confirmar.'),
    status,
    h('section', { className: `mt-5 p-5 sm:p-7 ${UI.card}`, 'aria-labelledby': 'inbound-title' },
      h('h2', { id: 'inbound-title', className: 'text-xl font-semibold' }, 'Nueva entrada'), form),
    h('p', { className: 'mt-4 text-sm' }, h('a', { href: PATHS.products, 'data-link': true, className: 'font-medium text-sky-800 underline' }, '← Volver a activos')));

  const selected = () => assets.find(a => String(a.id) === asset.control.value);
  const syncOffice = () => { officeValue.textContent = selected()?.office ?? '—'; };
  asset.control.addEventListener('change', () => { setFieldError(asset, ''); syncOffice(); });

  async function loadAssets(selectedId: string): Promise<boolean> {
    asset.control.disabled = true;
    asset.control.replaceChildren(h('option', { value: '' }, 'Cargando activos…'));
    try {
      assets = await ctx.api.listProducts();
      fillProductSelect(asset.control, assets, selectedId);
      asset.control.disabled = assets.length === 0;
      submit.disabled = assets.length === 0;
      if (!assets.length) status.replaceChildren(banner('error', 'No hay activos registrados; no se puede registrar una entrada.'));
      syncOffice();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return false;
      submit.disabled = true;
      status.replaceChildren(banner('error', `No se pudieron cargar los activos: ${(error as Error).message}`));
      return false;
    }
  }

  function validate(): { asset?: Asset; quantity?: number; supplier?: string } {
    const chosen = selected();
    setFieldError(asset, chosen ? '' : 'Selecciona el activo recibido.');
    const qty = parseQuantity(quantity.control.value);
    setFieldError(quantity, qty.error ?? '');
    const name = supplier.control.value.trim();
    setFieldError(supplier, name ? (name.length > 200 ? 'Máximo 200 caracteres.' : '') : 'Indica el proveedor o vendedor.');
    if (!chosen || qty.error || !name || name.length > 200) return {};
    return { asset: chosen, quantity: qty.value, supplier: name };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return; // duplicate-submission guard (double click / Enter)
    status.replaceChildren();
    const valid = validate();
    if (!valid.asset || valid.quantity === undefined || valid.supplier === undefined) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Registrando…';
    form.setAttribute('aria-busy', 'true');
    try {
      await ctx.api.createInboundOrder({ asset_id: valid.asset.id, quantity: valid.quantity, supplier: valid.supplier, office: valid.asset.office });
      form.reset();
      await loadAssets('');
      const updated = assets.find(a => a.id === valid.asset!.id);
      status.replaceChildren(banner('success', `Entrada registrada: +${valid.quantity} × ${valid.asset.name} (${valid.asset.sku}) de ${valid.supplier}. ${TERMS.currentStock}: ${updated?.current_stock ?? 'actualizado'}.`));
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) return;
        if (error.fieldErrors.quantity) setFieldError(quantity, error.fieldErrors.quantity);
        if (error.fieldErrors.supplier) setFieldError(supplier, error.fieldErrors.supplier);
        if (error.fieldErrors.asset_id) setFieldError(asset, error.fieldErrors.asset_id);
        status.replaceChildren(banner('error', `No se pudo registrar la entrada (HTTP ${error.status || 'sin conexión'}): ${error.message}`));
      } else {
        status.replaceChildren(banner('error', 'No se pudo registrar la entrada.'));
      }
    } finally {
      submitting = false;
      submit.disabled = assets.length === 0;
      submit.textContent = TERMS.registerInbound;
      form.removeAttribute('aria-busy');
    }
  });

  await loadAssets(ctx.params.get('asset_id') ?? '');
}
