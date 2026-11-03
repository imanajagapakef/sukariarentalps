import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie and redirects logged-out visitors
 * away from /admin. Role checks happen later (getStaffUser + RLS) — this is
 * only the login wall.
 *
 * /api/admin/* is included so a route handler that forgets its own
 * `getStaffUser()` check is still stopped at the edge (defense in depth), and
 * so the session cookie is refreshed on API traffic too. Verification uses
 * `getClaims` rather than `getUser`: this project signs JWTs with an asymmetric
 * (ES256) key, so the signature is checked locally against the cached JWKS instead
 * of asking the Auth server about every request — and an about-to-expire session
 * is still refreshed first, which is the other job this middleware has.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/admin");
  const authed = path.startsWith("/admin") || path.startsWith("/login") || isApi;
  if (!authed) return NextResponse.next();

  let response = NextResponse.next({ request });

  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey } = getPublicEnv();

  const supabase = createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: verified } = await supabase.auth.getClaims();
  const signedIn = Boolean(verified?.claims.sub);

  if (!signedIn && isApi) {
    // API callers expect JSON, not a redirect to /login.
    return NextResponse.json(
      { error: { message: "Harus login dulu", code: "UNAUTHENTICATED" } },
      { status: 401 },
    );
  }
  if (!signedIn && path.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (signedIn && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/login", "/api/admin/:path*"],
};
