import type { Metadata, Viewport } from "next";
import { Anton, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

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
};

export const viewport: Viewport = {
  themeColor: "#131313",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${anton.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}