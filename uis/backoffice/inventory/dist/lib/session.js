export function isAuthError(error) {
    return error instanceof Error && typeof error.status === 'number' &&
        typeof error.fieldErrors === 'object';
}
export function getNexovaAuth(win) {
    if (!win.NexovaAuth)
        throw new Error('NexovaAuth no está cargado: incluye suppliers/dist/auth-session.js antes del módulo de inventario.');
    return win.NexovaAuth;
}
