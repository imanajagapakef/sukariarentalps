import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "siqjyxawzlkybvkkfhny.supabase.co" },
    ],
  },
  experimental: {
    optimizePackageImports: ["radix-ui", "lucide-react"],
  },
};

export default nextConfig;
