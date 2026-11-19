/**
 * Account/profile resource client over the shared authenticated HTTP client (./http.ts).
 * Reading the account (GET /auth/me) is done by NexovaAuth `session.verify({ force: true })`, which is
 * also what validates the session; this module only owns the profile write.
 */
import { createApiClient, type ApiClientOptions } from './http.js';

/** services/api ProfileFields: every field optional, trimmed, empty → null. */
export interface ProfileUpdate {
  name: string | null;
  phone: string | null;
  address: string | null;
}

/** Profile document returned by PUT /profiles/me. */
export interface Profile extends ProfileUpdate {
  id: number;
  user_id: number;
}

export interface AccountApi {
  /**
   * PUT /profiles/me replaces all three fields (the API applies `model_dump()` without
   * `exclude_unset`), so the full set is always sent; omitting one would erase it.
   */
  updateProfile(update: ProfileUpdate): Promise<Profile>;
}

export function createAccountApi(options: ApiClientOptions): AccountApi {
  const { request } = createApiClient(options);
  return {
    updateProfile: update => request<Profile>('PUT', '/profiles/me', {
      name: update.name, phone: update.phone, address: update.address,
    }),
  };
}
