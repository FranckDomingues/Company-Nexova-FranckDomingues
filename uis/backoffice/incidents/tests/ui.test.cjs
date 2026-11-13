const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const wait = () => new Promise(resolve => setTimeout(resolve, 15));
function setup(fetchImpl) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/uis/backoffice/incidents/' });
  dom.window.scrollTo = () => {};
  dom.window.NEXOVA_API_URL = 'http://api.test/api';
  dom.window.fetch = fetchImpl;
  dom.window.eval(appJs);
  return dom;
}
const ok = data => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }));
(async () => {
  let calls = 0;
  const validation = setup(async () => { calls++; return ok({}); });
  await wait();
  validation.window.document.querySelector('[data-view="register"]').click();
  validation.window.document.querySelector('#incident-form').dispatchEvent(new validation.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(validation.window.document.querySelector('[name="title"]').closest('label').querySelector('.field-error').textContent, /complete/);
  assert.equal(calls, 1, 'invalid form must not send POST');
  const network = setup(async url => url.endsWith('/incidents') && !url.endsWith('/summary')
    ? new Response(JSON.stringify({ message: 'server internals hidden' }), { status: 500, headers: { 'content-type': 'application/json' } }) : ok({}));
  await wait(); network.window.document.querySelector('[data-view="register"]').click();
  const form = network.window.document.querySelector('#incident-form');
  form.elements.title.value = 'Connectivity issue'; form.elements.description.value = 'Network unavailable';
  form.elements.category.value = 'technical_failure'; form.elements.origin.value = 'branch'; form.elements.branch.value = 'central';
  form.dispatchEvent(new network.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(network.window.document.querySelector('#submit-button').disabled, false);
  assert.match(network.window.document.querySelector('#form-message').textContent, /couldn’t register/i);
  assert.doesNotMatch(network.window.document.querySelector('#form-message').textContent, /server internals/);
  const row = { id: 7, title: 'Login error', category: 'technical_failure', status: 'open', origin: 'customer', branch: 'central', created_at: '2024-01-01T00:00:00Z' };
  const rollback = setup(async url => {
    if (url.endsWith('/summary')) return ok({ total: 0, by_status: { open: 0, in_progress: 0 }, by_category: {}, by_origin: {}, by_branch: {} });
    if (url.endsWith('/incidents')) return ok([row]);
    if (url.endsWith('/status')) return new Response(JSON.stringify({ detail: 'offline' }), { status: 503, headers: { 'content-type': 'application/json' } });
    return ok({});
  });
  await wait(); rollback.window.document.querySelector('[data-view="incidents"]').click(); await wait();
  const select = rollback.window.document.querySelector('.table-status'); select.value = 'in_progress';
  select.dispatchEvent(new rollback.window.Event('change', { bubbles: true })); await wait();
  assert.equal(rollback.window.document.querySelector('.badge').textContent, 'Open');
  assert.match(rollback.window.document.querySelector('#global-message').textContent, /rolled back/i);

  let finishPost;
  const successful = setup(async url => {
    if (url.endsWith('/summary')) return ok({ total: 0, by_status: { open: 0, in_progress: 0 }, by_category: {}, by_origin: {}, by_branch: {} });
    if (url.endsWith('/incidents') && !url.includes('?')) return new Promise(resolve => { finishPost = resolve; });
    return ok([]);
  });
  await wait(); successful.window.document.querySelector('[data-view="register"]').click();
  const successForm = successful.window.document.querySelector('#incident-form');
  successForm.elements.title.value = 'Branch access issue'; successForm.elements.description.value = 'Branch cannot access support portal';
  successForm.elements.category.value = 'technical_failure'; successForm.elements.origin.value = 'branch'; successForm.elements.branch.value = 'valencia_operations';
  successForm.elements.origin.dispatchEvent(new successful.window.Event('change', { bubbles: true }));
  assert.equal(successful.window.document.querySelector('.branch-field').classList.contains('emphasized'), true);
  successForm.dispatchEvent(new successful.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(successful.window.document.querySelector('#submit-button').disabled, true, 'submit is disabled while POST is pending');
  assert.equal(successful.window.document.querySelector('.spinner').classList.contains('hidden'), false, 'loading indicator is visible');
  finishPost(new Response(JSON.stringify({ id: 11 }), { status: 201, headers: { 'content-type': 'application/json' } })); await wait();
  assert.equal(successful.window.document.querySelector('#submit-button').disabled, false);
  assert.equal(successForm.elements.title.value, '');
  assert.match(successful.window.document.querySelector('#form-message').textContent, /registered successfully/i);

  let listRequests = 0;
  const retry = setup(async url => {
    if (url.endsWith('/summary')) return new Response('{}', { status: 503 });
    if (url.includes('/incidents')) { listRequests++; return listRequests === 1 ? new Response('{}', { status: 503 }) : ok([]); }
    return ok({});
  });
  await wait(); retry.window.document.querySelector('[data-view="incidents"]').click(); await wait();
  assert.ok(retry.window.document.querySelector('.retry-list'));
  retry.window.document.querySelector('.retry-list').click(); await wait();
  assert.equal(listRequests, 2, 'retry refetches list');
  assert.ok(retry.window.document.querySelector('#empty-state').classList.contains('hidden') === false);
  console.log('Frontend DOM tests passed: required validation, safe API errors, loading/submission, branch highlight, successful reset, list retry/empty state, and failed status rollback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
