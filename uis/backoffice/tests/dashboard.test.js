"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class Element {
  constructor(id = "") {
    this.id = id; this.textContent = ""; this.hidden = false; this.disabled = false;
    this.files = []; this.listeners = {}; this.children = [];
    this.classList = { add() {}, remove() {} };
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  replaceChildren(...children) { this.children = children; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  remove() {}
  click() {}
  focus() {}
}

function makeDashboard(fetchImpl) {
  const elements = new Map();
  const get = (id) => {
    const key = id.startsWith("#") ? id.slice(1) : id;
    if (!elements.has(key)) elements.set(key, new Element(key));
    return elements.get(key);
  };
  const document = { querySelector: get, createElement: (tag) => new Element(tag), body: get("body") };
  const context = {
    window: { location: { hostname: "localhost", protocol: "http:" } }, document,
    fetch: fetchImpl, TypeError, FormData: class { append() {} },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    encodeURIComponent, console, process,
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "dashboard.js"), "utf8");
  vm.runInNewContext(script, context, { filename: "dashboard.js" });
  return { get, elements };
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function submit(ui, file = { name: "incidents.csv" }) {
  ui.get("csv-file").files = [file];
  return ui.get("upload-form").listeners.submit({ preventDefault() {} });
}

async function main() {
  const request = deferred();
  const ui = makeDashboard(() => request.promise);
  const pending = submit(ui);
  assert.equal(ui.get("upload-status").textContent, "Procesando el archivo de forma segura…");
  assert.equal(ui.get("analyze-button").disabled, true);
  request.resolve({ ok: false, status: 503 });
  await pending;
  assert.match(ui.get("upload-error").textContent, /servicio de análisis/);
  assert.equal(ui.get("upload-status").textContent, "");
  assert.equal(ui.get("analyze-button").disabled, false);

  let calls = 0;
  const retryUi = makeDashboard(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("network details CANARY");
    return { ok: true, json: async () => ({ analysis_id: "abc", metrics: { valid_records: 0, average_satisfaction: null } }) };
  });
  await submit(retryUi);
  assert.match(retryUi.get("upload-error").textContent, /No se pudo conectar/);
  assert.doesNotMatch(retryUi.get("upload-error").textContent, /CANARY/);
  await submit(retryUi);
  assert.equal(retryUi.get("results").hidden, false);
  assert.equal(retryUi.get("average-value").textContent, "N/D");
  assert.equal(retryUi.get("empty-data-note").hidden, false);
  assert.match(retryUi.get("upload-status").textContent, /Análisis completado/);

  const staleRequest = deferred();
  const staleUi = makeDashboard(() => staleRequest.promise);
  const originalFile = { name: "old.csv" };
  const stalePending = submit(staleUi, originalFile);
  staleUi.get("csv-file").files = [{ name: "new.csv" }];
  staleRequest.resolve({ ok: true, json: async () => ({ analysis_id: "stale", metrics: {} }) });
  await stalePending;
  assert.equal(staleUi.get("results").hidden, true);
  assert.equal(staleUi.get("export-button").disabled, true);

  const invalidJsonUi = makeDashboard(async () => ({ ok: true, json: async () => { throw new SyntaxError("CANARY parser detail"); } }));
  await submit(invalidJsonUi);
  assert.match(invalidJsonUi.get("upload-error").textContent, /respuesta no válida/);
  assert.doesNotMatch(invalidJsonUi.get("upload-error").textContent, /CANARY/);
  assert.equal(invalidJsonUi.get("analyze-button").disabled, false);

  const noLeakUi = makeDashboard(async () => { throw new Error("CANARY_SECRET"); });
  await submit(noLeakUi);
  assert.match(noLeakUi.get("upload-error").textContent, /contacta con soporte/);
  assert.doesNotMatch(noLeakUi.get("upload-error").textContent, /CANARY_SECRET/);
  console.log("5 dashboard async error-handling scenarios passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
