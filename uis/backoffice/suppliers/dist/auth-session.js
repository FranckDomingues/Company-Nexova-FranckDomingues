(() => {
const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NexovaAuth = void 0;
exports.validateLoginInput = validateLoginInput;
exports.getTokenExpiration = getTokenExpiration;
exports.isTokenExpired = isTokenExpired;
exports.createAuthSession = createAuthSession;
function validateLoginInput(username, password) {
    if (typeof username !== 'string' || !username.trim())
        return 'Introduce tu correo electrónico.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim()))
        return 'Introduce un correo electrónico válido.';
    if (typeof password !== 'string' || password.length === 0)
        return 'Introduce tu contraseña.';
    return null;
}
function decodeJwtPayload(token) {
    const segments = token.split('.');
    if (segments.length !== 3 || !segments[1] || !/^[A-Za-z0-9_-]+$/.test(segments[1]))
        return null;
    try {
        const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
            .padEnd(Math.ceil(segments[1].length / 4) * 4, '=');
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
            ? payload
            : null;
    }
    catch {
        return null;
    }
}
/** Returns the JWT exp claim in seconds; it is advisory and never verifies the token. */
function getTokenExpiration(token) {
    var _a;
    const expiration = (_a = decodeJwtPayload(token)) === null || _a === void 0 ? void 0 : _a.exp;
    return typeof expiration === 'number' && Number.isFinite(expiration) ? expiration : null;
}
/** Treats malformed or non-expiring tokens as expired; the API remains authoritative. */
function isTokenExpired(token, nowSeconds = Date.now() / 1000) {
    const expiration = getTokenExpiration(token);
    return expiration === null || !Number.isFinite(nowSeconds) || expiration <= nowSeconds;
}
async function responseError(response) {
    let detail = `Error de autenticación (${response.status})`;
    try {
        const payload = await response.json();
        if (typeof payload.detail === 'string')
            detail = payload.detail;
    }
    catch { /* A non-JSON response still has a useful status-based error. */ }
    return new Error(detail);
}
function createAuthSession(options) {
    var _a, _b;
    const fetcher = (_a = options.fetcher) !== null && _a !== void 0 ? _a : fetch;
    const now = (_b = options.now) !== null && _b !== void 0 ? _b : (() => Date.now() / 1000);
    let accessToken = null;
    let account = null;
    function clear() {
        accessToken = null;
        account = null;
    }
    return {
        get account() { return account; },
        getAuthorizationHeader() {
            if (!accessToken)
                return null;
            if (isTokenExpired(accessToken, now())) {
                clear();
                return null;
            }
            return `Bearer ${accessToken}`;
        },
        async login(input) {
            const validationError = validateLoginInput(input === null || input === void 0 ? void 0 : input.username, input === null || input === void 0 ? void 0 : input.password);
            if (validationError)
                throw new Error(validationError);
            clear();
            const form = new URLSearchParams({ username: input.username.trim(), password: input.password });
            const tokenResponse = await fetcher(`${options.apiBase}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form.toString(),
            });
            if (!tokenResponse.ok)
                throw await responseError(tokenResponse);
            const tokenPayload = await tokenResponse.json();
            if (typeof tokenPayload.access_token !== 'string' || !tokenPayload.access_token ||
                (tokenPayload.token_type !== undefined && String(tokenPayload.token_type).toLowerCase() !== 'bearer')) {
                throw new Error('La respuesta de autenticación no contiene un token Bearer válido.');
            }
            if (isTokenExpired(tokenPayload.access_token, now()))
                throw new Error('El token recibido ha expirado o no es válido.');
            accessToken = tokenPayload.access_token;
            try {
                const accountResponse = await fetcher(`${options.apiBase}/auth/me`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!accountResponse.ok)
                    throw await responseError(accountResponse);
                const current = await accountResponse.json();
                if (typeof current.email !== 'string' || typeof current.role !== 'string' ||
                    current.profile === null || typeof current.profile !== 'object' || Array.isArray(current.profile)) {
                    throw new Error('La respuesta de la cuenta no tiene un formato válido.');
                }
                account = current;
                return account;
            }
            catch (error) {
                clear();
                throw error;
            }
        },
        logout() { clear(); },
    };
}
exports.NexovaAuth = { validateLoginInput, getTokenExpiration, isTokenExpired, createAuthSession };
if (typeof window !== 'undefined')
    window.NexovaAuth = exports.NexovaAuth;

})();
