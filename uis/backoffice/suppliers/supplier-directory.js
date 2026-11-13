(() => {
  const API_BASE = window.NEXOVA_API_URL || 'http://127.0.0.1:8000';
  const { categories, labelFor, escapeHtml, currencyLabel, isRenewalSoon } = window.NexovaSupplierUtils;
  const rows = document.querySelector('#supplier-rows');
  const countryFilter = document.querySelector('#country-filter');
  const categoryFilter = document.querySelector('#category-filter');
  const count = document.querySelector('#result-count');
  const message = document.querySelector('#page-message');
  const form = document.querySelector('#supplier-form');
  const rateDialog = document.querySelector('#rate-dialog');
  let suppliers = [];
  let editingRateId = null;
  function showMessage(text, isError = false) {
    message.textContent = text;
    message.className = `mt-5 rounded-md border px-4 py-3 text-sm ${isError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`;
  }
  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) {
      let detail = `Error de API (${response.status})`;
      try { const payload = await response.json(); detail = Array.isArray(payload.detail) ? payload.detail.map(e => `${e.loc.slice(1).join('.')}: ${e.msg}`).join('; ') : payload.detail || detail; } catch { /* response without JSON */ }
      throw new Error(detail);
    }
    return response.status === 204 ? null : response.json();
  }
  function render() {
    const filtered = suppliers.filter(s => (!countryFilter.value || s.country === countryFilter.value) && (!categoryFilter.value || s.categories.includes(categoryFilter.value)));
    count.textContent = `${filtered.length} proveedor${filtered.length === 1 ? '' : 'es'}`;
    if (!filtered.length) { rows.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-500">No hay proveedores para estos filtros.</td></tr>'; return; }
    rows.innerHTML = filtered.map(s => {
      const suspended = s.status === 'suspended';
      const due = isRenewalSoon(s.contract_renewal_date);
      return `<tr class="${suspended ? 'bg-slate-50 text-slate-500' : ''}">
        <td class="px-4 py-4"><div class="font-semibold text-slate-900">${escapeHtml(s.name)}</div>${s.contact_email ? `<div class="mt-1 text-xs text-slate-500">${escapeHtml(s.contact_email)}</div>` : ''}</td>
        <td class="whitespace-nowrap px-4 py-4">${escapeHtml(s.country)}</td>
        <td class="px-4 py-4">${s.categories.map(c => `<span class="mb-1 mr-1 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs">${escapeHtml(labelFor(c))}</span>`).join('')}</td>
        <td class="whitespace-nowrap px-4 py-4 font-medium">${escapeHtml(currencyLabel(s))}</td>
        <td class="px-4 py-4"><span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${suspended ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}">${suspended ? 'Suspendido' : 'Activo'}</span></td>
        <td class="whitespace-nowrap px-4 py-4 ${due ? 'font-semibold text-amber-800' : ''}">${s.contract_renewal_date ? `${escapeHtml(s.contract_renewal_date)}${due ? ' · Próxima' : ''}` : '—'}</td>
        <td class="whitespace-nowrap px-4 py-4"><div class="flex flex-wrap gap-2"><button data-rate="${s.id}" class="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100">Cambiar tarifa</button><button data-status="${s.id}" data-next="${suspended ? 'active' : 'suspended'}" class="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100">${suspended ? 'Activar' : 'Suspender'}</button></div></td>
      </tr>`;
    }).join('');
  }
  async function load() {
    try { suppliers = await api('/suppliers'); render(); }
    catch (error) { rows.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-rose-700">No se pudo cargar el directorio. Comprueba que la API esté disponible.</td></tr>'; showMessage(error.message, true); }
  }
  for (const select of [categoryFilter, form.elements.categories]) {
    for (const [value, label] of categories) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); }
  }
  countryFilter.addEventListener('change', render);
  categoryFilter.addEventListener('change', render);
  document.querySelector('#clear-filters').addEventListener('click', () => { countryFilter.value = ''; categoryFilter.value = ''; render(); });
  form.elements.country.addEventListener('change', () => { form.elements.currency.value = form.elements.country.value === 'Spain' ? 'EUR' : form.elements.country.value === 'USA' ? 'USD' : ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const errorBox = document.querySelector('#form-error'); errorBox.textContent = '';
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const payload = { name: data.get('name').trim(), country: data.get('country'), categories: [...form.elements.categories.selectedOptions].map(option => option.value), monthly_rate: Number(data.get('monthly_rate')), currency: data.get('currency'), status: data.get('status') };
    for (const key of ['contract_renewal_date', 'contact_email', 'notes']) if (data.get(key)) payload[key] = data.get(key);
    try { await api('/suppliers', { method: 'POST', body: JSON.stringify(payload) }); form.reset(); showMessage('Proveedor registrado correctamente.'); await load(); }
    catch (error) { errorBox.textContent = error.message; }
  });
  rows.addEventListener('click', async event => {
    const rateButton = event.target.closest('[data-rate]');
    const statusButton = event.target.closest('[data-status]');
    if (rateButton) { editingRateId = rateButton.dataset.rate; document.querySelector('#rate-error').textContent = ''; rateDialog.showModal(); return; }
    if (statusButton) {
      try { const supplier = await api(`/suppliers/${statusButton.dataset.status}/status`, { method: 'PATCH', body: JSON.stringify({ status: statusButton.dataset.next }) }); suppliers = suppliers.map(s => s.id === supplier.id ? supplier : s); render(); showMessage(`Estado de ${supplier.name} actualizado.`); }
      catch (error) { showMessage(error.message, true); }
    }
  });
  document.querySelector('#rate-form').addEventListener('submit', async event => {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const rateForm = event.currentTarget;
    if (!rateForm.reportValidity()) return;
    try {
      const updated = await api(`/suppliers/${editingRateId}/rate`, { method: 'PATCH', body: JSON.stringify({ monthly_rate: Number(rateForm.elements.monthly_rate.value) }) });
      suppliers = suppliers.map(s => s.id === updated.id ? updated : s); rateDialog.close(); rateForm.reset(); render(); showMessage(`Tarifa de ${updated.name} actualizada.`);
    } catch (error) { document.querySelector('#rate-error').textContent = error.message; }
  });
  load();
})();
