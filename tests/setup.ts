import { config } from "dotenv";
import { vi } from "vitest";

config({ path: ".env.local", quiet: true });
config({ path: ".env.test", quiet: true });

/**
 * `next/headers` is the one thing an admin route cannot be tested without: it throws
 * outside a request scope, and `getStaffUser()` reads the staff profile through the
 * cookie-scoped client it provides. Mocking it here — the framework boundary, not app
 * code — is what lets a test sign in for real and then call a route handler directly.
 *
 * Two real bugs shipped on admin routes precisely because nothing could do this: the
 * bookings search 500'd on every term, and "deactivate staff" deleted the account.
 *
 * The jar is a global so the mock factory (hoisted, runs before any import) and the test
 * body share one instance. The session cookie is written by @supabase/ssr itself during
 * sign-in, so its encoding is never hand-rolled here.
 */
const jar = new Map<string, string>();
(globalThis as Record<string, unknown>).__adminCookieJar = jar;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
