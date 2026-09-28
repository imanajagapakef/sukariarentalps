import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/tempat-main", label: "Tempat Main" },
  { href: "/games", label: "Games" },
  { href: "/snacks", label: "Snacks" },
  { href: "/promo", label: "Promo" },
  { href: "/cabang", label: "Cabang" },
  { href: "/cek-booking", label: "Cek Booking" },
  { href: "/feedback", label: "Feedback" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="font-display shrink-0 text-xl uppercase tracking-wide text-primary">
          Klub Sukaria
        </Link>
        <nav aria-label="Utama" className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-2.5 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-muted hover:text-foreground"
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

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface-lowest">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p className="font-display text-on-surface">Klub Sukaria — Gaming Lounge 24 Jam</p>
        <p>Tanjungpinang · Buka 24 jam · @klubsukaria</p>
      </div>
    </footer>
  );
}
