import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS and is the only way to call the booking
 * RPCs (their EXECUTE is revoked from anon/authenticated).
 *
 * Server-only. Never import this into a Client Component.
 *
 * `revalidate` is opt-in and only for public pages: it puts Next's data cache in
 * front of PostgREST, so repeat views skip the 40-70 ms network round trip entirely.
 * Callers on a live booking (the extension page) must not ask for it — a stale
 * "sisa 2 menit" on an action page is worse than a slow one. Admin routes are
 * `force-dynamic`, which forces no-store and ignores this either way.
 */
export function createAdminClient(options?: { revalidate?: number }): SupabaseClient<Database> {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY: key } = getServerEnv();

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(options?.revalidate
      ? {
          global: {
            // Parameter types are inferred on purpose: supabase-js declares an
            // overloaded fetch here, and annotating it narrows the signature enough
            // that the client stops being a SupabaseClient<Database>.
            fetch: (input, init) =>
              fetch(input as RequestInfo, {
                ...init,
                next: { revalidate: options.revalidate },
              } as RequestInit),
          },
        }
      : {}),
  });
}