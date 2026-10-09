import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { getBranches } from "@/lib/catalog";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking" },
  { href: "/games", label: "Games" },
  { href: "/tempat-main", label: "Tempat Main" },
  { href: "/snacks", label: "Snacks" },
  { href: "/promo", label: "Promo" },
  { href: "/cabang", label: "Cabang" },
  { href: "/cek-booking", label: "Cek Booking" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="shrink-0" aria-label="Klub Sukaria — home">
          <Image
            src="/brand/logo-compact.svg"
            alt="Klub Sukaria"
            width={150}
            height={40}
            priority
            unoptimized
            className="h-8 w-auto md:hidden"
          />
          <Image
            src="/brand/logo-primary.svg"
            alt="Klub Sukaria Gaming House"
            width={210}
            height={42}
            priority
            unoptimized
            className="hidden h-10 w-auto md:block"
          />
        </Link>
        <nav
          aria-label="Utama"
          className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto"
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Button asChild size="sm" className="hidden shrink-0 md:inline-flex">
          <Link href="/booking">Booking Sekarang</Link>
        </Button>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const branches = await getBranches();

  return (
    <footer className="mt-20 border-t border-white/8 bg-surface-lowest">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div>
          <Image
            src="/brand/logo-primary.svg"
            alt="Klub Sukaria Gaming House"
            width={230}
            height={46}
            unoptimized
            className="h-11 w-auto"
          />
          <p className="mt-3 max-w-xs text-sm text-on-surface-variant">
            Gaming House &amp; PS Rental 24 Jam Tanjungpinang. Tempat nongkrong,
            turnamen, dan rental konsol paling asik.
          </p>
        </div>

        <div>
          <p className="font-display text-sm uppercase tracking-wide text-foreground">
            Lokasi Cabang
          </p>
          <ul className="mt-3 space-y-3 text-sm text-on-surface-variant">
            {branches.map((b) => (
              <li key={b.branch_id}>
                <Link href={`/cabang`} className="hover:text-primary">
                  <span className="block font-bold text-foreground">
                    {b.name}
                  </span>
                  {b.address && <span className="text-xs">{b.address}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-display text-sm uppercase tracking-wide text-foreground">
            Jelajah
          </p>
          <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
            {[
              { href: "/games", label: "Katalog Game" },
              { href: "/tempat-main", label: "Tempat Main" },
              { href: "/snacks", label: "Menu Cemilan & Kopi" },
              { href: "/promo", label: "Promo Paket Mantai" },
              { href: "/cek-booking", label: "Cek Status Booking" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-primary">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-display text-sm uppercase tracking-wide text-foreground">
            Bantuan
          </p>
          <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
            <li>
              <Link href="/feedback" className="hover:text-primary">
                Feedback
              </Link>
            </li>
            <li>Buka 24 jam setiap hari</li>
            <li>Tanjungpinang, Kepulauan Riau</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>© Klub Sukaria. Main Sepuasnya, Gas Sesukamu.</p>
          <p>24 Jam · Tanjungpinang</p>
        </div>
      </div>
    </footer>
  );
}
