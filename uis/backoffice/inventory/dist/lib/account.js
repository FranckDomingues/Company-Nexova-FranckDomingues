/**
 * Account/profile resource client over the shared authenticated HTTP client (./http.ts).
 * Reading the account (GET /auth/me) is done by NexovaAuth `session.verify({ force: true })`, which is
 * also what validates the session; this module only owns the profile write.
 */
import { createApiClient } from './http.js';
export function createAccountApi(options) {
    const { request } = createApiClient(options);
    return {
        updateProfile: update => request('PUT', '/profiles/me', {
            name: update.name, phone: update.phone, address: update.address,
        }),
    };
}
