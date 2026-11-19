(() => {
const exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NexovaAuth = exports.PASSWORD_LIMITS = exports.PROFILE_LIMITS = exports.AuthError = exports.TOKEN_STORAGE_KEY = void 0;
exports.validateLoginInput = validateLoginInput;
exports.validateRegistrationInput = validateRegistrationInput;
exports.validateProfileFields = validateProfileFields;
exports.getTokenExpiration = getTokenExpiration;
exports.isTokenExpired = isTokenExpired;
exports.createTokenStore = createTokenStore;
exports.createAuthSession = createAuthSession;
/**
 * NexovaAuth — the single client-side authentication module for every private Nexova backoffice view
 * (inventory SPA and supplier directory). AUTH-02:
 *   - POST /auth/login (OAuth2 form) → JWT persisted in localStorage under TOKEN_STORAGE_KEY
 *   - POST /users (registration) → POST /auth/login with the same credentials
 *   - GET /auth/me validates the stored token against the API (the backend is the authority;
 *     the JWT `exp` claim is only used to discard obviously expired tokens early)
 *
 * Security note: the assignment requires localStorage. Any script running on the backoffice origin
 * (XSS) can read it, so the token is never logged, never rendered and never placed in URLs, and views
 * build DOM with text nodes only. See docs/evidence/AUTH-02-CHECKLIST.md.
 */
exports.TOKEN_STORAGE_KEY = 'nexova.auth.token';
/** status 0 = the API was unreachable. `fieldErrors` is keyed by request field (email, password, name…). */
class AuthError extends Error {
    constructor(status, message, fieldErrors = {}, code) {
        super(message);
        this.name = 'AuthError';
        this.status = status;
        this.fieldErrors = fieldErrors;
        this.code = code;
    }
}
exports.AuthError = AuthError;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
exports.PROFILE_LIMITS = { name: 200, phone: 50, address: 500 };
exports.PASSWORD_LIMITS = { min: 8, max: 128 };
const UNREACHABLE = 'No se pudo conectar con la API de Nexova. Comprueba tu conexión e inténtalo de nuevo.';
function validateLoginInput(username, password) {
    if (typeof username !== 'string' || !username.trim())
        return 'Introduce tu correo electrónico.';
    if (!EMAIL_PATTERN.test(username.trim()))
        return 'Introduce un correo electrónico válido.';
    if (typeof password !== 'string' || password.length === 0)
        return 'Introduce tu contraseña.';
    return null;
}
/** Mirrors services/api UserRegistration: email, password 8–128, optional name ≤200, phone ≤50, address ≤500. */
function validateRegistrationInput(input) {
    const errors = {};
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!email)
        errors.email = 'Introduce tu correo electrónico.';
    else if (!EMAIL_PATTERN.test(email))
        errors.email = 'Introduce un correo electrónico válido.';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!password)
        errors.password = 'Introduce una contraseña.';
    else if (password.length < exports.PASSWORD_LIMITS.min || password.length > exports.PASSWORD_LIMITS.max) {
        errors.password = `La contraseña debe tener entre ${exports.PASSWORD_LIMITS.min} y ${exports.PASSWORD_LIMITS.max} caracteres.`;
    }
    Object.assign(errors, validateProfileFields(input));
    return errors;
}
/** Mirrors services/api ProfileFields (all optional, trimmed, max lengths). */
function validateProfileFields(input) {
    const errors = {};
    for (const key of ['name', 'phone', 'address']) {
        const value = input[key];
        if (typeof value === 'string' && value.trim().length > exports.PROFILE_LIMITS[key])
            errors[key] = `Máximo ${exports.PROFILE_LIMITS[key]} caracteres.`;
    }
    return errors;
}
/** Spanish, field-specific messages for FastAPI 422 items; unknown fields keep the API text. */
const FIELD_MESSAGES = {
    email: 'Introduce un correo electrónico válido.',
    password: `La contraseña debe tener entre ${exports.PASSWORD_LIMITS.min} y ${exports.PASSWORD_LIMITS.max} caracteres.`,
    name: `Máximo ${exports.PROFILE_LIMITS.name} caracteres.`,
    phone: `Máximo ${exports.PROFILE_LIMITS.phone} caracteres.`,
    address: `Máximo ${exports.PROFILE_LIMITS.address} caracteres.`,
};
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
/**
 * localStorage-backed store. Every access is guarded: during SSR/prerender there is no `window`, and
 * browsers may throw on storage access (privacy modes, quota). In those cases the token lives in memory only.
 */
function createTokenStore(storage) {
    let memory = null;
    const resolve = () => {
        if (storage !== undefined)
            return storage;
        try {
            return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
        }
        catch {
            return null;
        }
    };
    return {
        get() {
            const target = resolve();
            if (target) {
                try {
                    return target.getItem(exports.TOKEN_STORAGE_KEY);
                }
                catch { /* fall back to memory */ }
            }
            return memory;
        },
        set(token) {
            memory = token;
            const target = resolve();
            if (target) {
                try {
                    target.setItem(exports.TOKEN_STORAGE_KEY, token);
                }
                catch { /* memory only */ }
            }
        },
        clear() {
            memory = null;
            const target = resolve();
            if (target) {
                try {
                    target.removeItem(exports.TOKEN_STORAGE_KEY);
                }
                catch { /* nothing persisted */ }
            }
        },
    };
}
async function readJson(response) {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
}
async function responseError(response, fallback) {
    var _a;
    const payload = await readJson(response);
    const detail = payload !== null && typeof payload === 'object' ? payload.detail : undefined;
    if (Array.isArray(detail)) {
        const fieldErrors = {};
        for (const issue of detail) {
            const loc = Array.isArray(issue === null || issue === void 0 ? void 0 : issue.loc) ? issue.loc.filter(part => part !== 'body').map(String) : [];
            const field = loc[0];
            if (field && !fieldErrors[field]) {
                fieldErrors[field] = (_a = FIELD_MESSAGES[field]) !== null && _a !== void 0 ? _a : (typeof (issue === null || issue === void 0 ? void 0 : issue.msg) === 'string' ? issue.msg : 'Valor no válido.');
            }
        }
        return new AuthError(response.status, 'Revisa los campos marcados.', fieldErrors);
    }
    return new AuthError(response.status, typeof detail === 'string' && detail.trim() ? detail : `${fallback} (HTTP ${response.status})`);
}
const LOGIN_MESSAGES = {
    'Incorrect email or password': 'Correo electrónico o contraseña incorrectos.',
    'Inactive account': 'Esta cuenta está desactivada. Contacta con un administrador.',
};
function isCurrentAccount(value) {
    const account = value;
    return !!account && typeof account.email === 'string' && typeof account.role === 'string' &&
        account.profile !== null && typeof account.profile === 'object' && !Array.isArray(account.profile);
}
function createAuthSession(options) {
    var _a, _b, _c;
    const fetcher = (_a = options.fetcher) !== null && _a !== void 0 ? _a : ((input, init) => fetch(input, init));
    const now = (_b = options.now) !== null && _b !== void 0 ? _b : (() => Date.now() / 1000);
    const store = (_c = options.store) !== null && _c !== void 0 ? _c : createTokenStore();
    const base = options.apiBase.replace(/\/+$/, '');
    /** The token whose validity GET /auth/me confirmed during this page load, and its account. */
    let verifiedToken = null;
    let account = null;
    let pending = null;
    function clear() {
        store.clear();
        verifiedToken = null;
        account = null;
        pending = null;
    }
    /** Current usable token: present, well-formed and not past its `exp` claim (otherwise it is removed). */
    function currentToken() {
        const token = store.get();
        if (!token) {
            if (verifiedToken) {
                verifiedToken = null;
                account = null;
            }
            return null;
        }
        if (isTokenExpired(token, now())) {
            clear();
            return null;
        }
        return token;
    }
    async function send(path, init) {
        try {
            return await fetcher(`${base}${path}`, init);
        }
        catch {
            throw new AuthError(0, UNREACHABLE);
        }
    }
    async function fetchAccount(token) {
        const response = await send('/auth/me', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
        if (response.status === 401)
            return null;
        if (!response.ok)
            throw await responseError(response, 'No se pudo verificar la sesión');
        const current = await readJson(response);
        if (!isCurrentAccount(current))
            throw new AuthError(response.status, 'La respuesta de la cuenta no tiene un formato válido.');
        return current;
    }
    const session = {
        get account() {
            return currentToken() !== null && verifiedToken === store.get() ? account : null;
        },
        getAuthorizationHeader() {
            const token = currentToken();
            return token ? `Bearer ${token}` : null;
        },
        /** True only when GET /auth/me accepted the current token during this page load. */
        isVerified() {
            const token = currentToken();
            return token !== null && token === verifiedToken;
        },
        /**
         * Validate the stored token with the API (GET /auth/me). Returns the account, or null when there is no
         * token or the API rejects it with 401 (the token is then removed). Other failures (network, 5xx, 403)
         * throw an AuthError and keep the token: they say nothing about the token's validity.
         */
        async verify(verifyOptions = {}) {
            const token = currentToken();
            if (!token)
                return null;
            if (!verifyOptions.force && token === verifiedToken && account)
                return account;
            if (pending && pending.token === token)
                return pending.promise;
            const promise = (async () => {
                try {
                    const current = await fetchAccount(token);
                    if (store.get() !== token)
                        return null; // logged out or replaced meanwhile
                    if (!current) {
                        clear();
                        return null;
                    }
                    verifiedToken = token;
                    account = current;
                    return current;
                }
                finally {
                    if ((pending === null || pending === void 0 ? void 0 : pending.token) === token)
                        pending = null;
                }
            })();
            pending = { token, promise };
            return promise;
        },
        async login(input) {
            var _a;
            const validationError = validateLoginInput(input === null || input === void 0 ? void 0 : input.username, input === null || input === void 0 ? void 0 : input.password);
            if (validationError)
                throw new AuthError(422, validationError);
            clear();
            const form = new URLSearchParams({ username: input.username.trim(), password: input.password });
            // Unauthenticated endpoint: a 401 here is a wrong password, never a session expiry (no redirect).
            const tokenResponse = await send('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: form.toString(),
            });
            if (!tokenResponse.ok) {
                const error = await responseError(tokenResponse, 'No se pudo iniciar sesión');
                if (tokenResponse.status === 401) {
                    throw new AuthError(401, (_a = LOGIN_MESSAGES[error.message]) !== null && _a !== void 0 ? _a : 'Correo electrónico o contraseña incorrectos.');
                }
                throw error;
            }
            const tokenPayload = await readJson(tokenResponse);
            const token = tokenPayload === null || tokenPayload === void 0 ? void 0 : tokenPayload.access_token;
            if (typeof token !== 'string' || !token ||
                ((tokenPayload === null || tokenPayload === void 0 ? void 0 : tokenPayload.token_type) !== undefined && String(tokenPayload.token_type).toLowerCase() !== 'bearer')) {
                throw new AuthError(tokenResponse.status, 'La respuesta de autenticación no contiene un token Bearer válido.');
            }
            if (isTokenExpired(token, now()))
                throw new AuthError(tokenResponse.status, 'El token recibido ha expirado o no es válido.');
            const current = await fetchAccount(token);
            if (!current)
                throw new AuthError(401, 'La API rechazó el token recién emitido. Inténtalo de nuevo.');
            store.set(token);
            verifiedToken = token;
            account = current;
            return current;
        },
        /** POST /users with the backend's exact contract, then POST /auth/login with the same credentials. */
        async register(input) {
            var _a;
            const fieldErrors = validateRegistrationInput(input);
            if (Object.keys(fieldErrors).length)
                throw new AuthError(422, 'Revisa los campos marcados.', fieldErrors);
            clear();
            const email = input.email.trim();
            const body = { email, password: input.password };
            for (const key of ['name', 'phone', 'address']) {
                const value = (_a = input[key]) === null || _a === void 0 ? void 0 : _a.trim();
                if (value)
                    body[key] = value;
            }
            const response = await send('/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
            });
            if (response.status === 409) {
                throw new AuthError(409, 'Ya existe una cuenta con este correo electrónico.', { email: 'Este correo ya está registrado. Inicia sesión o usa otro.' });
            }
            if (!response.ok)
                throw await responseError(response, 'No se pudo crear la cuenta');
            try {
                return await session.login({ username: email, password: input.password });
            }
            catch (error) {
                throw new AuthError(error instanceof AuthError ? error.status : 0, `Tu cuenta se creó, pero no se pudo iniciar sesión automáticamente: ${error.message} Inicia sesión manualmente.`, {}, 'REGISTERED_LOGIN_FAILED');
            }
        },
        /** Removes the token from storage and memory. */
        logout() { clear(); },
    };
    return session;
}
exports.NexovaAuth = {
    TOKEN_STORAGE_KEY: exports.TOKEN_STORAGE_KEY,
    AuthError,
    validateLoginInput,
    validateRegistrationInput,
    validateProfileFields,
    getTokenExpiration,
    isTokenExpired,
    createTokenStore,
    createAuthSession,
};
if (typeof window !== 'undefined')
    window.NexovaAuth = exports.NexovaAuth;

})();
