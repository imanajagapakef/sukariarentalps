import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cookieless anon client for public catalog reads (RLS allows anon SELECT).
 * Unlike lib/supabase/server, this does not touch cookies(), so pages using it
 * stay cacheable (ISR) instead of being forced dynamic. One client per process
 * is safe: it holds no per-user session state.
 */
let client: SupabaseClient<Database> | null = null;

export function createPublicClient() {
  if (!client) {
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (url, init) =>
            fetch(url, { ...init, next: { revalidate: 300 } } as RequestInit),
        },
      },
    );
  }
  return client;
}
