import type { Metadata, Viewport } from "next";
import { Anton, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { WebVitals } from "@/components/web-vitals";
import { MotionPause } from "@/components/motion-pause";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Klub Sukaria — Gaming Lounge 24 Jam",
  description:
    "PS5, Nintendo Switch, game rame-rame, sampai tempat VIP. Pilih cabang, pilih waktu, langsung booking.",
  icons: {
    icon: [{ url: "/brand/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/brand/icon.svg", type: "image/svg+xml" }],
  },
  ...(process.env.NEXT_PUBLIC_SITE_URL
    ? {
        metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL),
        openGraph: {
          title: "Klub Sukaria — Gaming Lounge 24 Jam",
          description:
            "PS5, Nintendo Switch, game rame-rame, sampai tempat VIP. Pilih cabang, pilih waktu, langsung booking.",
          images: [{ url: "/brand/logo-primary.svg", alt: "Klub Sukaria" }],
        },
        twitter: {
          card: "summary",
          title: "Klub Sukaria — Gaming Lounge 24 Jam",
          description:
            "PS5, Nintendo Switch, game rame-rame, sampai tempat VIP. Pilih cabang, pilih waktu, langsung booking.",
        },
      }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#131313",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={cn(anton.variable, jakarta.variable)}>
      <body>
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
        >
          Lewati ke konten
        </a>
        {children}
        <WebVitals />
        <MotionPause />
      </body>
    </html>
  );
}
