import { z } from "zod";

/**
 * Centralised environment access, validated once and cached.
 *
 * Before this, every client used `process.env.X!`, so a missing value surfaced
 * as a library error ("supabaseUrl is required") deep inside a request rather
 * than a named failure at the boundary. The getters below throw a message that
 * names the offending variable.
 *
 * This module pulls in zod, so it is only imported from server-side code
 * (route handlers, pages, middleware). The browser client does its own inline
 * check instead — see `lib/supabase/client.ts` — to keep zod out of the client
 * bundle.
 */

const blankToUndefined = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("harus berupa URL yang valid"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "wajib diisi"),
  NEXT_PUBLIC_SITE_URL: z.string().url("harus berupa URL yang valid").optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let publicCache: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (publicCache) return publicCache;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: blankToUndefined(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NEXT_PUBLIC_SITE_URL: blankToUndefined(process.env.NEXT_PUBLIC_SITE_URL),
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`Konfigurasi environment tidak valid — ${detail}`);
  }

  publicCache = parsed.data;
  return publicCache;
}

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "wajib diisi"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let serverCache: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (serverCache) return serverCache;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: blankToUndefined(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(`Konfigurasi environment server tidak valid — ${detail}`);
  }

  serverCache = parsed.data;
  return serverCache;
}
