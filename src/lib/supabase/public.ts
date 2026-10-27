import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

/**
 * Cookieless anon client for public catalog reads (RLS allows anon SELECT).
 * Unlike lib/supabase/server, this does not touch cookies(), so pages using it
 * stay cacheable (ISR) instead of being forced dynamic.
 *
 * One client per cache lifetime is safe: it holds no per-user session state.
 *
 * `revalidate` is per read, not per client, because the catalog and the live bracket
 * want opposite things: a snack menu can sit in the cache for five minutes, but a
 * tournament result that appears five minutes late on the homepage is the whole problem
 * the homepage section exists to solve. Callers that need freshness pass a small number
 * and get their own client back.
 */

/** Default for anything that changes on the order of days (catalog, branches, games). */
const DEFAULT_REVALIDATE = 300;

const clients = new Map<number, SupabaseClient<Database>>();

export function createPublicClient(options?: { revalidate?: number }) {
  const revalidate = options?.revalidate ?? DEFAULT_REVALIDATE;

  const existing = clients.get(revalidate);
  if (existing) return existing;

  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = getPublicEnv();

  const client = createClient<Database>(
    url,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          // 0 means "no cache at all" — it is a real mode here, not a typo guard, so it
          // maps to `cache: "no-store"` instead of a 0-second revalidation window.
          revalidate > 0
            ? fetch(url, { ...init, next: { revalidate } } as RequestInit)
            : fetch(url, { ...init, cache: "no-store" } as RequestInit),
      },
    },
  );
  clients.set(revalidate, client);
  return client;
}