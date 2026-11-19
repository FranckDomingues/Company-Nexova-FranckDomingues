/** Minimal Chrome DevTools Protocol client (Node >= 22 global WebSocket; no dependencies). */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function launchChrome(chromePath, port) {
  const profile = mkdtempSync(join(tmpdir(), 'nexova-e2e-chrome-'));
  const proc = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not expose a page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const exceptions = [];
  const networkErrors = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'exception');
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const { source, text, url } = message.params.entry;
      (source === 'network' ? networkErrors : exceptions).push(source === 'network' ? `${text} ${url ?? ''}`.trim() : text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? expression}`);
    return result.result.value;
  }

  return {
    exceptions,
    networkErrors,
    evaluate,
    async goto(url) { await send('Page.navigate', { url }); await sleep(300); },
    async waitFor(expression, timeout = 15000) {
      const end = Date.now() + timeout;
      for (;;) {
        try { if (await evaluate(expression)) return; } catch { /* page navigating */ }
        if (Date.now() > end) throw new Error(`Timed out waiting for: ${expression}`);
        await sleep(100);
      }
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async close() {
      try { ws.close(); } catch { /* ignore */ }
      proc.kill('SIGTERM');
      await sleep(300);
      rmSync(profile, { recursive: true, force: true });
    },
  };
}
