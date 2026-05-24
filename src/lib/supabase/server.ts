import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Returns the service-role Supabase client. SERVER-ONLY.
 * Never import this from a Client Component or expose to the browser —
 * the service role key bypasses RLS.
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const env = loadEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
