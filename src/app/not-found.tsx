import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Root not-found.tsx renders for any unmatched URL, so it sits OUTSIDE the (customer)
// route group and never receives SiteHeader/SiteFooter. Moving the file into the group
// does not help -- Next only uses a group copy for notFound() thrown inside that group.
// The chrome is applied here instead.
const QUICK_LINKS = [
  { href: "/games", title: "Games", description: "Katalog 58 judul konsol" },
  { href: "/tempat-main", title: "Tempat Main", description: "Unit dan fasilitas" },
  { href: "/promo", title: "Promo", description: "Paket dan harga khusus" },
  { href: "/snacks", title: "Snacks", description: "Menu dan inventori" },
  { href: "/cabang", title: "Cabang", description: "Lokasi dan jam buka" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-16">
        <div className="text-center">
          <p className="font-display text-7xl uppercase text-primary">404</p>
          <h1 className="font-display mt-2 text-2xl uppercase">Kamu nyasar nih</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Halaman ini tidak ada, mungkin kodenya salah ketik.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/">Kembali ke Home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/booking">Booking Sekarang</Link>
            </Button>
          </div>
        </div>

        <h2 className="font-display mt-16 text-center text-sm uppercase tracking-widest text-muted-foreground">
          Rute Cepat Lainnya
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <li key={link.href}>
              <Card size="sm" className="h-full transition-colors hover:ring-primary/50">
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={link.href}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      {link.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}