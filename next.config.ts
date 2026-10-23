import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin workspace root so the dev watcher doesn't scan the C:\ drive root
  // (prevents "Watchpack Error: EINVAL lstat C:\pagefile.sys" noise on Windows).
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "siqjyxawzlkybvkkfhny.supabase.co" },
    ],
  },
  experimental: {
    optimizePackageImports: ["radix-ui", "lucide-react"],
    // Unit photos in Supabase Storage are ~1.6 MB; the image optimizer aborts
    // its download after 7 s by default (TimeoutError -> /_next/image 500).
    // Raise the limit so slow/cold CDN downloads still complete and get cached.
    imgOptTimeoutInSeconds: 30,
  },
};

export default nextConfig;
