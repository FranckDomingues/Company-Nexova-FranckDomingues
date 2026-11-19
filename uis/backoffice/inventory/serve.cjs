#!/usr/bin/env node
/**
 * Dependency-free static server for the Nexova backoffice.
 *   /backoffice/*                        -> files under uis/backoffice/
 *   /backoffice/login, /backoffice/register, /backoffice/account/profile,
 *   /backoffice/inventory/<route> (no file extension)
 *                                        -> inventory/index.html (client-side routing)
 *   /login, /register, /account/profile  -> 302 to the /backoffice/ equivalents (AUTH-02 route names)
 * Usage: node serve.cjs [--port 5500]  (env: PORT, NEXOVA_API_URL)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SHELL = path.join(__dirname, 'index.html');
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.PORT || 5500);
const HOST = process.env.HOST || '127.0.0.1';
const SHELL_ROUTES = new Set(['/backoffice/login', '/backoffice/register', '/backoffice/account/profile']);
const ALIASES = { '/login': '/backoffice/login', '/register': '/backoffice/register', '/account/profile': '/backoffice/account/profile' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request', 'text/plain'); }
  if (pathname === '/' ) { res.writeHead(302, { Location: '/backoffice/' }); return res.end(); }
  if (Object.hasOwn(ALIASES, pathname)) { res.writeHead(302, { Location: `${ALIASES[pathname]}${url.search}` }); return res.end(); }
  if (pathname === '/backoffice/config.js') {
    const apiUrl = process.env.NEXOVA_API_URL;
    return send(res, 200, apiUrl ? `window.NEXOVA_API_URL = ${JSON.stringify(apiUrl)};\n` : '/* default API base */\n', TYPES['.js']);
  }
  if (!pathname.startsWith('/backoffice/')) return send(res, 404, 'Not found', 'text/plain');
  const route = pathname.replace(/\/$/, '');
  const isAppRoute = SHELL_ROUTES.has(route) || /^\/backoffice\/inventory(\/[a-z/]*)?$/.test(route);
  if (isAppRoute && !path.extname(pathname)) return send(res, 200, fs.readFileSync(SHELL), TYPES['.html']);
  let file = path.resolve(ROOT, '.' + pathname.slice('/backoffice'.length));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, 'Forbidden', 'text/plain');
  if (/[\\/](node_modules|tests|e2e|coverage)[\\/]/.test(file)) return send(res, 404, 'Not found', 'text/plain');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
});

server.listen(PORT, HOST, () => console.log(`Nexova backoffice: http://${HOST}:${PORT}/backoffice/inventory/products`));
