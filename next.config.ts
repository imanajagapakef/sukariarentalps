import type { NextConfig } from "next";

// The only external origin the app talks to is Supabase (auth, database, and
// image storage). Parse the host from the public URL env var at build time.
// Host wajib dari env di semua mode — tanpa fallback hardcoded ke project
// lama — agar CSP/allowlist tidak menunjuk ke host basi.
// TODO (lanjutan): nonce via middleware untuk menghilangkan 'unsafe-inline'
// dari script-src. Perlu perubahan middleware + App Router.
function getSupabaseHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL wajib diisi saat build. " +
        "Isi dengan URL project Supabase aktif (lihat .env.example).",
    );
  }
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL bukan URL yang valid: ${url}`);
  }
}

const supabaseHost = getSupabaseHost();
const isDev = process.env.NODE_ENV === "development";

// Google fonts are self-hosted via next/font (Anton + Plus Jakarta Sans), so
// fonts only come from the app itself. web-vitals beacons are same-origin.
// script-src keeps 'unsafe-inline' because the App Router embeds small
// bootstrap scripts inline (nonce injection would require middleware changes).
// 'unsafe-eval' is dev-only (Next.js HMR requires it).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://${supabaseHost}`,
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Pin workspace root so the dev watcher doesn't scan the C:\ drive root
  // (prevents "Watchpack Error: EINVAL lstat C:\pagefile.sys" noise on Windows).
  outputFileTracingRoot: __dirname,
  // Bisa diarahkan ke folder lain (mis. saat mengukur build produksi sementara
  // `next dev` masih jalan). Default tetap `.next`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost },
    ],
  },
  experimental: {
    optimizePackageImports: ["radix-ui", "lucide-react"],
    // Unit photos in Supabase Storage are ~1.6 MB; the image optimizer aborts
    // its download after 7 s by default (TimeoutError -> /_next/image 500).
    // Raise the limit so slow/cold CDN downloads still complete and get cached.
    imgOptTimeoutInSeconds: 30,
    // Router Cache. Next 15 dropped the client-side cache for dynamic routes to 0,
    // so every revisit to an admin page re-ran the server component — the main
    // reason switching back and forth between menu items felt slow. 30s restores
    // the old "instant back-and-forth", while LiveRefresh still calls
    // router.refresh() every 60s, which bypasses this cache and keeps live data
    // (the payment queue, unit status) fresh. Lower `dynamic` if a cashier ever
    // sees a stale queue figure within the window.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    const headers: Array<{ key: string; value: string }> = [
      { key: "Content-Security-Policy", value: csp },
      // X-Frame-Options is redundant with CSP frame-ancestors but covers
      // legacy clients that ignore CSP.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // The web app doesn't use camera, mic, or geolocation.
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    // HSTS only makes sense once the site is actually served over HTTPS with a
    // pinned deployment; in dev (http://localhost) it would poison nothing but
    // mention nothing useful either, so gate it on NODE_ENV.
    if (!isDev) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default nextConfig;
