import type { Metadata } from "next";
import Link from "next/link";
import {
  Armchair,
  CalendarCheck,
  Gamepad2,
  Home,
  MapPin,
  Popcorn,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Root not-found.tsx renders for any unmatched URL, so it sits OUTSIDE the (customer)
// route group and never receives SiteHeader/SiteFooter. Moving the file into the group
// does not help -- Next only uses a group copy for notFound() thrown inside that group.
// The chrome is applied here instead.

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
};

type QuickLink = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const QUICK_LINKS: QuickLink[] = [
  { href: "/games", title: "Games", description: "Katalog judul konsol", icon: Gamepad2 },
  { href: "/tempat-main", title: "Tempat Main", description: "Unit dan fasilitas", icon: Armchair },
  { href: "/promo", title: "Promo", description: "Paket dan harga khusus", icon: Tag },
  { href: "/snacks", title: "Snacks", description: "Menu dan inventori", icon: Popcorn },
  { href: "/cabang", title: "Cabang", description: "Lokasi dan jam buka", icon: MapPin },
];

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="konten" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:py-20 overflow-x-clip">
        <section className="text-center">
          <div
            aria-hidden="true"
            className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          >
            <Gamepad2 className="size-8" />
          </div>
          <p
            aria-hidden="true"
            className="font-display mt-4 text-7xl uppercase leading-none text-primary sm:text-8xl"
          >
            404
          </p>
          <h1 className="font-display mt-3 text-2xl uppercase sm:text-3xl">
            <span className="sr-only">Error 404: </span>
            Kamu nyasar nih
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            Halaman ini tidak ada atau sudah pindah. Cek lagi alamatnya, atau pilih
            salah satu rute di bawah.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/booking">
                <CalendarCheck aria-hidden="true" />
                Booking Sekarang
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/">
                <Home aria-hidden="true" />
                Kembali ke Home
              </Link>
            </Button>
          </div>
        </section>

        <nav aria-labelledby="quick-links-heading" className="mt-14 sm:mt-16">
          <h2
            id="quick-links-heading"
            className="font-display text-center text-sm uppercase tracking-widest text-muted-foreground"
          >
            Mau ke mana?
          </h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-3">
            {QUICK_LINKS.map(({ href, title, description, icon: Icon }) => (
              <li key={href} className="w-[calc(50%-0.375rem)] sm:w-52">
                <Link
                  href={href}
                  className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Card
                    size="sm"
                    className="h-full transition-colors group-hover:ring-primary/50"
                  >
                    <CardHeader>
                      <Icon
                        aria-hidden="true"
                        className="mb-1 size-5 text-primary transition-transform group-hover:scale-110 motion-reduce:transition-none"
                      />
                      <CardTitle>{title}</CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}