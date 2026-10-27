import Link from "next/link";
import Image from "next/image";
import { getBranches } from "@/lib/catalog";

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
                <Link href={`/cabang/${b.branch_id}`} className="transition-colors hover:text-primary">
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
              { href: "/turnamen", label: "Turnamen" },
              { href: "/cek-turnamen", label: "Cek Tiket Turnamen" },
              { href: "/cek-booking", label: "Cek Status Booking" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="transition-colors hover:text-primary">
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
              <Link href="/feedback" className="transition-colors hover:text-primary">
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
