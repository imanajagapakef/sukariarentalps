import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Test harness for authenticated admin route handlers.
 *
 * Sign in for real against the real auth server, then call the exported handler
 * directly. The session is genuine, `getStaffUser()` verifies it over the network and
 * the profile read goes through RLS — the only thing faked is Next's request scope
 * (see tests/setup.ts). A route's guards, its zod validation, its service calls and its
 * audit writes are all exercised for real.
 */

const jar = (globalThis as Record<string, unknown>).__adminCookieJar as Map<string, string>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const canAuthenticate = Boolean(
  url && anonKey && process.env.ADMIN_BOOTSTRAP_EMAIL && process.env.ADMIN_BOOTSTRAP_PASSWORD,
);

/** A server client bound to the same jar the `next/headers` mock reads from. */
function jarClient() {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach(({ name, value }) => void jar.set(name, value)),
    },
  });
}

export type SignedIn = { userId: string; email: string; role: string };

/** Signs in as the bootstrapped owner and leaves the session in the jar. */
export async function signInAsOwner(): Promise<SignedIn> {
  const client = jarClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.ADMIN_BOOTSTRAP_EMAIL!,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD!,
  });
  if (error || !data.user) throw new Error(`sign-in gagal: ${error?.message}`);
  return { userId: data.user.id, email: data.user.email!, role: "OWNER" };
}

export function signOut() {
  jar.clear();
}

type Handler<P> = (request: NextRequest, context: P) => Promise<Response>;

type Result = { status: number; body: unknown };

/** Calls a route handler and parses the JSON body, whatever the status. */
export async function callRoute<P>(
  handler: Handler<P>,
  context: P,
  { method = "POST", body, url: href = "http://localhost/api" }: {
    method?: string;
    body?: unknown;
    url?: string;
  } = {},
): Promise<Result> {
  const request = new NextRequest(
    new Request(href, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const response = await handler(request, context);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : null,
  };
}

/** The error message a route returned, for readable assertions. */
export function errorMessage(result: Result): string {
  const body = result.body as { error?: { message?: string } } | null;
  return body?.error?.message ?? "";
}

/** Does an auth user still exist? This is what a delete would have destroyed. */
export async function authUserExists(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.auth.admin.listUsers({ perPage: 200 });
  return (data?.users ?? []).some((u) => u.id === userId);
}

/** Is the account blocked from signing in, without deleting it? */
export async function isBanned(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) return false;
  const bannedUntil = (data.user as { banned_until?: string }).banned_until;
  return Boolean(bannedUntil) && new Date(bannedUntil!).getTime() > Date.now();
}

export async function profileOf(userId: string) {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("user_id, role, active").eq("user_id", userId).maybeSingle();
  return data;
}
