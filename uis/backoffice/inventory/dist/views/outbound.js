import { PATHS } from '../context.js';
import { h, UI } from '../dom.js';
import { ApiError } from '../lib/inventory.js';
import { TERMS, EXIT_TYPE_LABELS } from '../terms.js';
import { pageHeader, stockBadge } from './products.js';
import { banner, field, fillProductSelect, parseQuantity, setFieldError } from './forms.js';
/**
 * "Salida de activos": an allocation to an employee or a consumption event.
 * The stock shown and the over-quantity warning are advisory; POST /inventory/orders/outbound
 * enforces stock server-side (HTTP 400 is shown inline next to the quantity field).
 */
export async function renderOutbound(ctx) {
    let assets = [];
    let submitting = false;
    const status = h('div', { id: 'form-status', 'aria-live': 'polite', className: 'mt-5' });
    const asset = field('asset_id', TERMS.asset, h('select', { name: 'asset_id', required: true, className: UI.input }));
    const stockPanel = h('div', { id: 'stock-panel', 'aria-live': 'polite', className: 'mt-1 flex min-h-11 items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 text-slate-700' }, 'Selecciona un activo para ver su stock.');
    const exitType = field('exit_type', TERMS.exitType, h('select', { name: 'exit_type', required: true, className: UI.input }, ...Object.entries(EXIT_TYPE_LABELS).map(([value, label]) => h('option', { value }, label))));
    const assignedTo = field('assigned_to', TERMS.assignedTo, h('input', { name: 'assigned_to', type: 'text', maxlength: '200', className: UI.input, placeholder: 'Nombre o ID del empleado' }));
    const warning = h('p', { id: 'quantity-warning', className: UI.warning, dataset: { quantityWarning: '' }, hidden: true });
    const quantity = field('quantity', `${TERMS.quantity} (unidades)`, h('input', { name: 'quantity', type: 'number', inputmode: 'numeric', min: '1', step: '1', required: true, className: UI.input }), warning);
    const submit = h('button', { type: 'submit', className: UI.primary }, TERMS.registerOutbound);
    const form = h('form', { id: 'outbound-form', className: 'mt-5 grid gap-4 sm:grid-cols-2', novalidate: true }, asset.wrapper, h('div', {}, h('span', { className: UI.label }, TERMS.availableStock), stockPanel), exitType.wrapper, assignedTo.wrapper, quantity.wrapper, h('div', { className: 'sm:col-span-2' }, submit));
    ctx.root.append(pageHeader('Inventario · Salidas', TERMS.outbound, 'Registra la asignación de un activo a un empleado o un consumo de material. El stock disminuye al confirmar.'), status, h('section', { className: `mt-5 p-5 sm:p-7 ${UI.card}`, 'aria-labelledby': 'outbound-title' }, h('h2', { id: 'outbound-title', className: 'text-xl font-semibold' }, 'Nueva salida'), form), h('p', { className: 'mt-4 text-sm' }, h('a', { href: PATHS.products, 'data-link': true, className: 'font-medium text-sky-800 underline' }, '← Volver a activos')));
    const selected = () => assets.find(a => String(a.id) === asset.control.value);
    /** Reactive stock display + client-side warning; recalculated on product/quantity change. */
    function refreshStockView() {
        const chosen = selected();
        if (!chosen) {
            stockPanel.replaceChildren('Selecciona un activo para ver su stock.');
        }
        else {
            stockPanel.replaceChildren(h('span', { className: 'text-lg font-bold tabular-nums', dataset: { availableStock: String(chosen.current_stock) } }, chosen.current_stock), h('span', {}, `unidades en ${chosen.office}`), stockBadge(chosen.current_stock));
        }
        const qty = parseQuantity(quantity.control.value);
        const exceeds = Boolean(chosen && qty.value !== undefined && qty.value > chosen.current_stock);
        warning.hidden = !exceeds;
        warning.textContent = exceeds && chosen
            ? `Atención: la cantidad solicitada (${qty.value}) supera el stock disponible (${chosen.current_stock}). La API rechazará la salida si no hay stock suficiente.`
            : '';
    }
    function syncExitType() {
        const allocation = exitType.control.value === 'allocation';
        assignedTo.control.disabled = !allocation;
        assignedTo.control.required = allocation;
        if (!allocation) {
            assignedTo.control.value = '';
            setFieldError(assignedTo, '');
        }
    }
    asset.control.addEventListener('change', () => { setFieldError(asset, ''); setFieldError(quantity, ''); refreshStockView(); });
    quantity.control.addEventListener('input', () => { setFieldError(quantity, ''); refreshStockView(); });
    exitType.control.addEventListener('change', syncExitType);
    async function loadAssets(selectedId) {
        asset.control.disabled = true;
        try {
            assets = await ctx.api.listProducts();
            fillProductSelect(asset.control, assets, selectedId);
            asset.control.disabled = assets.length === 0;
            submit.disabled = assets.length === 0;
            if (!assets.length)
                status.replaceChildren(banner('error', 'No hay activos registrados; no se puede registrar una salida.'));
        }
        catch (error) {
            if (error instanceof ApiError && error.status === 401)
                return;
            submit.disabled = true;
            status.replaceChildren(banner('error', `No se pudo cargar el stock de los activos: ${error.message}`));
        }
        refreshStockView();
    }
    function validate() {
        const chosen = selected();
        setFieldError(asset, chosen ? '' : 'Selecciona el activo que sale del inventario.');
        const qty = parseQuantity(quantity.control.value);
        setFieldError(quantity, qty.error ?? '');
        const type = exitType.control.value;
        const employee = assignedTo.control.value.trim();
        const employeeError = type === 'allocation' && !employee ? 'Indica el empleado al que se asigna el activo.' : employee.length > 200 ? 'Máximo 200 caracteres.' : '';
        setFieldError(assignedTo, employeeError);
        if (!chosen || qty.value === undefined || employeeError)
            return null;
        return { asset: chosen, quantity: qty.value, exit_type: type, assigned_to: type === 'allocation' ? employee : null };
    }
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitting)
            return; // duplicate-submission guard
        status.replaceChildren();
        const valid = validate();
        if (!valid)
            return;
        submitting = true;
        submit.disabled = true;
        submit.textContent = 'Registrando…';
        form.setAttribute('aria-busy', 'true');
        try {
            await ctx.api.createOutboundOrder({ asset_id: valid.asset.id, quantity: valid.quantity, exit_type: valid.exit_type, assigned_to: valid.assigned_to, office: valid.asset.office });
            form.reset();
            syncExitType();
            await loadAssets('');
            const updated = assets.find(a => a.id === valid.asset.id);
            const detail = valid.exit_type === 'allocation' ? `asignado a ${valid.assigned_to}` : 'consumo';
            status.replaceChildren(banner('success', `Salida registrada: −${valid.quantity} × ${valid.asset.name} (${valid.asset.sku}), ${detail}. ${TERMS.currentStock}: ${updated?.current_stock ?? 'actualizado'}.`));
        }
        catch (error) {
            if (!(error instanceof ApiError)) {
                status.replaceChildren(banner('error', 'No se pudo registrar la salida.'));
                return;
            }
            if (error.status === 401)
                return;
            if (error.status === 400) {
                // Insufficient stock: shown inline beside quantity; refresh stock so the user sees the real value.
                setFieldError(quantity, error.message);
                await loadAssets(String(valid.asset.id));
                quantity.control.focus();
            }
            else {
                for (const [name, f] of [['quantity', quantity], ['assigned_to', assignedTo], ['asset_id', asset]]) {
                    if (error.fieldErrors[name])
                        setFieldError(f, error.fieldErrors[name]);
                }
                status.replaceChildren(banner('error', `No se pudo registrar la salida (HTTP ${error.status || 'sin conexión'}): ${error.message}`));
            }
        }
        finally {
            submitting = false;
            submit.disabled = assets.length === 0;
            submit.textContent = TERMS.registerOutbound;
            form.removeAttribute('aria-busy');
        }
    });
    syncExitType();
    await loadAssets(ctx.params.get('asset_id') ?? '');
}
