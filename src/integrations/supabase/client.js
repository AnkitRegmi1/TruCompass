import { createClient } from "@supabase/supabase-js";

export class SupabaseClient {
  constructor({ url, serviceRoleKey } = {}) {
    this.url = url;
    this.serviceRoleKey = serviceRoleKey;
    this.client =
      url && serviceRoleKey
        ? createClient(url, serviceRoleKey, {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          })
        : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  from(tableName) {
    if (!this.client) {
      throw new Error("Supabase is not configured.");
    }

    return this.client.from(tableName);
  }
}
