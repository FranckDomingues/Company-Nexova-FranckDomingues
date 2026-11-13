const API_BASE = window.NEXOVA_API_URL || new URLSearchParams(window.location.search).get('api') || 'http://127.0.0.1:8000/api';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const labels = {
  technical_failure: 'Technical failure', process_error: 'Process error', client_complaint: 'Client complaint',
  candidate_issue: 'Candidate issue', staff_issue: 'Staff issue', sla_breach: 'SLA breach', data_quality: 'Data quality', other: 'Other',
  customer: 'Customer', branch: 'Branch', internal: 'Internal', central: 'Central — Valencia HQ',
  valencia_operations: 'Valencia — Operations', miami_office: 'Miami Office', remote: 'Remote',
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', discarded: 'Discarded'
};
let currentView = 'dashboard';

function showView(view) {
  currentView = view;
  $$('.view').forEach(element => element.classList.toggle('hidden', element.id !== `view-${view}`));
  $$('.nav-link').forEach(element => element.classList.toggle('active', element.dataset.view === view));
  $('#page-title').textContent = { dashboard: 'Incident overview', incidents: 'Incident queue', register: 'Register an incident' }[view];
  if (view === 'dashboard') loadSummary();
  if (view === 'incidents') loadIncidents();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.detail || 'The request could not be completed. Please try again.');
    error.fields = body.field_errors || {};
    throw error;
  }
  return body;
}

function setNotice(element, text, kind = 'error') {
  element.textContent = text;
  element.className = `notice ${kind}`;
}
function displayName(value) { return labels[value] || value.replaceAll('_', ' '); }
function prettyDate(value) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function fieldError(form, field, message) {
  const input = form.elements[field];
  if (!input) return;
  input.classList.toggle('invalid', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));
  input.closest('label')?.querySelector('.field-error')?.replaceChildren(document.createTextNode(message || ''));
}

async function loadSummary() {
  const state = $('#summary-state');
  state.textContent = 'Loading live summary…';
  try {
    const data = await request('/incidents/summary');
    $('#total-count').textContent = data.total;
    $('#open-count').textContent = data.by_status.open;
    $('#progress-count').textContent = data.by_status.in_progress;
    $('#sla-count').textContent = (data.by_category.sla_breach || 0);
    renderMetrics('#status-summary', data.by_status, data.total);
    renderMetrics('#category-summary', data.by_category, data.total);
    renderMetrics('#origin-summary', data.by_origin, data.total);
    renderMetrics('#branch-summary', data.by_branch, data.total);
    state.textContent = 'Summary updated just now.';
  } catch (_) {
    state.innerHTML = 'Summary could not be loaded. <button class="secondary retry-summary">Try again</button>';
    $('.retry-summary', state).addEventListener('click', loadSummary);
  }
}

function renderMetrics(selector, metrics, total) {
  const entries = Object.entries(metrics);
  $(selector).innerHTML = entries.map(([key, count]) => `<div class="metric-row"><span class="metric-label">${displayName(key)}</span><span class="metric-value">${count}</span><span class="meter"><i style="width:${total ? Math.round(count / total * 100) : 0}%"></i></span></div>`).join('') || '<p class="empty-copy">No data yet.</p>';
}

function queryFilters() {
  const query = new URLSearchParams();
  [['status', '#filter-status'], ['origin', '#filter-origin'], ['branch', '#filter-branch'], ['category', '#filter-category']].forEach(([key, selector]) => {
    if ($(selector).value) query.set(key, $(selector).value);
  });
  return query.toString();
}

async function loadIncidents() {
  const state = $('#list-state'); const tbody = $('#incident-rows'); const empty = $('#empty-state');
  state.textContent = 'Loading incidents…'; tbody.replaceChildren(); empty.classList.add('hidden');
  try {
    const incidents = await request(`/incidents${queryFilters() ? `?${queryFilters()}` : ''}`);
    state.textContent = `${incidents.length} ${incidents.length === 1 ? 'incident' : 'incidents'} shown`;
    if (!incidents.length) { empty.classList.remove('hidden'); return; }
    tbody.innerHTML = incidents.map(incident => `<tr data-id="${incident.id}"><td><span class="incident-title">${escapeHtml(incident.title)}</span><span class="incident-id">#${incident.id} · ${escapeHtml(incident.category === 'sla_breach' ? 'Priority issue' : 'Incident')}</span></td><td>${escapeHtml(displayName(incident.category))}</td><td>${escapeHtml(displayName(incident.origin))}<span class="branch-text">${escapeHtml(displayName(incident.branch))}</span></td><td>${prettyDate(incident.created_at)}</td><td><span class="badge ${incident.status}">${displayName(incident.status)}</span></td><td>${statusControl(incident)}</td></tr>`).join('');
    $$('.table-status', tbody).forEach(control => control.addEventListener('change', () => updateIncidentStatus(control)));
  } catch (_) {
    state.innerHTML = 'We couldn’t load the incident list. <button class="secondary retry-list">Try again</button>';
    $('.retry-list', state).addEventListener('click', loadIncidents);
  }
}
function statusControl(incident) {
  const transitions = { open: ['in_progress', 'discarded'], in_progress: ['resolved', 'discarded'], resolved: [], discarded: [] };
  const options = transitions[incident.status].map(status => `<option value="${status}">Move to ${displayName(status)}</option>`).join('');
  return options ? `<select class="table-status" aria-label="Update status for ${escapeHtml(incident.title)}"><option value="">Update…</option>${options}</select>` : '<span class="incident-id">Final</span>';
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

async function updateIncidentStatus(control) {
  const row = control.closest('tr'); const id = row.dataset.id; const oldLabel = $('.badge', row).textContent.toLowerCase().replaceAll(' ', '_'); const newStatus = control.value;
  if (!newStatus) return;
  control.disabled = true; $('.badge', row).textContent = 'Updating…';
  try {
    await request(`/incidents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    setNotice($('#global-message'), 'Incident status updated successfully.', 'success');
    $('#global-message').classList.remove('hidden');
    loadIncidents();
  } catch (_) {
    $('.badge', row).textContent = displayName(oldLabel);
    control.value = ''; control.disabled = false;
    setNotice($('#global-message'), 'The status could not be updated. Your change was rolled back.', 'error');
    $('#global-message').classList.remove('hidden');
  }
}

function validateForm(form) {
  let valid = true;
  ['title', 'description', 'category', 'origin', 'branch'].forEach(field => {
    const value = form.elements[field].value.trim();
    const message = value ? '' : 'Please complete this field.';
    fieldError(form, field, message); valid = valid && !message;
  });
  if (form.elements.title.value.trim().length > 120) { fieldError(form, 'title', 'Use 120 characters or fewer.'); valid = false; }
  return valid;
}

async function submitIncident(event) {
  event.preventDefault(); const form = event.currentTarget; const notice = $('#form-message');
  notice.classList.add('hidden');
  if (!validateForm(form)) { setNotice(notice, 'Please correct the highlighted fields before submitting.'); notice.classList.remove('hidden'); return; }
  const button = $('#submit-button'); button.disabled = true; $('.button-label', button).textContent = 'Submitting…'; $('.spinner', button).classList.remove('hidden');
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    await request('/incidents', { method: 'POST', body: JSON.stringify(payload) });
    form.reset(); $('.branch-field').classList.remove('emphasized');
    setNotice(notice, 'Incident registered successfully. It is now in the incident queue.', 'success'); notice.classList.remove('hidden');
  } catch (error) {
    Object.entries(error.fields || {}).forEach(([field, message]) => fieldError(form, field, message));
    setNotice(notice, Object.keys(error.fields || {}).length ? 'Please review the highlighted fields.' : 'We couldn’t register the incident. Please try again in a moment.'); notice.classList.remove('hidden');
  } finally {
    button.disabled = false; $('.button-label', button).textContent = 'Create incident'; $('.spinner', button).classList.add('hidden');
  }
}

$$('.nav-link').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
$('#new-incident').addEventListener('click', () => showView('register'));
$('#refresh-list').addEventListener('click', loadIncidents);
$$('.retry-list').forEach(button => button.addEventListener('click', loadIncidents));
$('#incident-form').addEventListener('submit', submitIncident);
['status', 'origin', 'branch', 'category'].forEach(field => $(`#filter-${field}`).addEventListener('change', loadIncidents));
$('#incident-form').elements.origin.addEventListener('change', event => $('.branch-field').classList.toggle('emphasized', event.target.value === 'branch'));
$$('#incident-form input, #incident-form textarea, #incident-form select').forEach(input => input.addEventListener('input', () => fieldError($('#incident-form'), input.name, '')));
showView('dashboard');
