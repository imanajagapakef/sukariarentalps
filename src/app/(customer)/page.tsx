import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Ticker } from "@/components/ticker";
import { getBranches } from "@/lib/catalog";

export default async function Home() {
  const branches = await getBranches();

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-24">
        <p className="font-display text-sm uppercase tracking-[0.06em] text-primary-container">
          Buka 24 Jam
        </p>
        <h1 className="font-display mt-2 text-4xl uppercase leading-[0.95] md:text-7xl">
          Main Sepuasnya.
          <br />
          Gas Sesukamu.
        </h1>
        <p className="mt-4 max-w-xl text-on-surface-variant">
          PS5, Nintendo Switch, game rame-rame, sampai tempat VIP. Pilih cabang, pilih waktu,
          langsung booking.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/booking">Booking Sekarang</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/tempat-main">Lihat Tempat Main</Link>
          </Button>
        </div>
      </section>

      <Ticker
        items={[
          "PS5 · Switch · PS4",
          "Buka 24 Jam",
          "Tempat VIP",
          "Nonton Bola Rame-rame",
          "Snack & Drink Ready",
          `${branches.length} Cabang Tanjungpinang`,
        ]}
      />

      <section className="mx-auto max-w-6xl px-4 py-14 md:px-8">
        <h2 className="font-display text-2xl uppercase md:text-3xl">Cabang Kami</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {branches.map((b) => (
            <Link
              key={b.branch_id}
              href={`/tempat-main?branch=${b.branch_id}`}
              className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <p className="font-display text-lg uppercase">{b.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{b.address}</p>
              <p className="mt-3 text-sm text-primary">Jam: {b.operating_hours}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { href: "/games", title: "Games", desc: "Katalog game yang kami punya" },
            { href: "/snacks", title: "Snacks", desc: "Teman main, tinggal ambil" },
            { href: "/cek-booking", title: "Cek Booking", desc: "Masukkan kode tiket SR-..." },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-xl border border-border bg-surface-low p-5 transition-colors hover:border-primary"
            >
              <p className="font-display uppercase">{c.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
