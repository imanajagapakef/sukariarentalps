import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Gamepad2, MapPin, Monitor, Phone, Send, Star, Tag, Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { StatCards } from "@/components/stat-cards";
import {
  getBranches,
  getFacilityTypes,
  getGames,
  getMinHourlyRates,
  getSnacks,
  getUnitsWithFacility,
} from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNextFreeMapByBranch } from "@/lib/next-free";
import { getBranchPhotosFor } from "@/lib/branch-photos";
import { branchCover } from "@/lib/branch-photo-gallery";
import { facilityCopy } from "@/lib/facility-copy";
import { fmtTime, rp } from "@/lib/format";
import { Cover } from "@/components/cover";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { BranchDetailHeroAnimation } from "@/components/branch-detail-hero-animation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ branch_id: string }> }) {
  const { branch_id } = await params;
  const branch = (await getBranches()).find((b) => b.branch_id === branch_id);
  return { title: branch ? `${branch.name} — Klub Sukaria` : "Cabang — Klub Sukaria" };
}

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ branch_id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ branch_id }, { type }] = await Promise.all([params, searchParams]);

  const db = createAdminClient({ revalidate: 20 });
  const [branches, allUnits, facilityTypes, rates, games, snacks, branchPhotos, nextFree] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getFacilityTypes(),
    getMinHourlyRates(),
    getGames(),
    getSnacks(),
    getBranchPhotosFor(branch_id),
    // Scoped to this branch and fired in the same wave — the branch id comes from the
    // route, so there is nothing left to wait for.
    getNextFreeMapByBranch(db, branch_id),
  ]);

  const branch = branches.find((b) => b.branch_id === branch_id);
  if (!branch) notFound();

  const units = allUnits.filter((u) => u.branch_id === branch_id);
  const shown = type ? units.filter((u) => u.facility_type_id === type) : units;

  const readyCount = units.filter((u) => u.status === "AVAILABLE").length;
  const platformCount = new Set(units.map((u) => u.facility_types?.platform).filter(Boolean)).size;
  const codeByType = new Map(facilityTypes.map((f) => [f.facility_type_id, f.code]));
  const hereGames = games.filter((g) =>
    g.game_availability.some((a) => a.branch_id === branch_id && a.available),
  );
  const mapsUrl = branch.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}`
    : null;
  // The hero is the branch's own cover — the first photo in its admin gallery.
  // The two fallbacks are there so the hero is never blank on a branch nobody has
  // uploaded photos for yet: the legacy single image_url, then a unit photo. The
  // last of those is what this used to use unconditionally, which meant the big
  // image on a branch page was whichever console happened to have artwork.
  const heroImage =
    branchCover(branchPhotos)?.image_url ?? branch.image_url ?? units.find((u) => u.image_url)?.image_url;
  const minRate = Math.min(...Object.values(rates).filter((r): r is number => typeof r === "number"));
  const waNumber = branch.phone?.replace(/[^0-9]/g, "");
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=Halo%20Admin%20${encodeURIComponent(branch.name)}` : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      {/* BREADCRUMB */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 text-sm">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Tempat Main", href: "/tempat-main" },
            { label: branch.name },
          ]}
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold uppercase text-primary">
          <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          Cabang Resmi {branch.operating_hours}
        </span>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="relative h-80 sm:h-96 md:h-115">
          {heroImage && (
            <Image src={heroImage} alt={branch.name} fill priority sizes="100vw" className="object-cover" />
          )}
          <div className="absolute inset-0 bg-linear-to-t from-card via-card/60 to-transparent" />
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary shadow-lg backdrop-blur-md">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
              {branch.operating_hours?.toLowerCase().includes("24") ? "Buka 24 Jam" : branch.operating_hours}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
              <Star aria-hidden className="size-4 text-primary" /> Verified Station
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="mb-2 inline-flex items-center gap-2">
              <span className="rounded bg-primary px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary-foreground">ID: {branch.branch_id}</span>
              <span className="rounded bg-card px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">FLAGSHIP ARENA</span>
            </div>
            <h1 className="max-w-3xl font-display text-4xl uppercase leading-none tracking-wide md:text-6xl">{branch.name}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Pusat Gaming House {branch.operating_hours} — Rental PS5 &amp; PSVR2, Arena Couch Co-Op, Turnamen Resmi &amp; Nongkrong Santai.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 rounded-lg bg-card/80 px-3 py-1.5">
                <Star aria-hidden className="size-4 text-primary" />
                <span className="font-medium">{branch.google_rating ?? "—"} / 5.0</span>
                <span className="text-muted-foreground">({branch.google_review_count ?? 0}+ ulasan)</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-card/80 px-3 py-1.5">
                <MapPin aria-hidden className="size-4 text-primary" />
                <span className="truncate max-w-60 sm:max-w-xs">{branch.address}</span>
              </span>
            </div>
          </div>
          <div className="absolute bottom-4 right-4 hidden w-60 md:block">
            <BranchDetailHeroAnimation className="h-24 w-full md:h-28" />
          </div>
        </div>
      </section>

      {/* LIVE STATS BAR — semua angka dari data cabang, bukan klaim hardcoded. */}
      <StatCards
        className="mt-6"
        cards={[
          { label: "Total unit konsol", value: `${units.length} unit`, icon: Gamepad2, hint: "di cabang ini" },
          {
            label: "Siap main",
            value: `${readyCount} live`,
            tone: readyCount > 0 ? "primary" : "muted",
            icon: Zap,
            hint: "bisa langsung gas",
          },
          { label: "Platform", value: `${platformCount} jenis`, icon: Monitor, hint: "konsol tersedia" },
          {
            label: "Game tersedia",
            value: hereGames.length,
            tone: "primary",
            icon: Tag,
            href: "/games",
            hint: "judul bisa dimainkan",
          },
        ]}
      />

      {/* TWO-COLUMN GRID */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          {/* BRANCH PHOTOS */}
          {branchPhotos.length > 0 && (
            <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
              <div className="mb-6">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-primary">Galeri Lokasi</span>
                <h2 className="font-display text-2xl uppercase">Suasana {branch.name}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {branchPhotos.map((p, i) => (
                  <figure
                    key={p.photo_id}
                    className="relative aspect-4/3 overflow-hidden rounded-xl border border-border bg-muted"
                  >
                    <Image
                      src={p.image_url}
                      alt={p.caption ?? `${branch.name} — foto ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 260px"
                      className="object-cover transition-transform duration-500 hover:scale-105"
                    />
                    {p.caption && (
                      <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2 text-xs text-white">
                        {p.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* FACILITIES */}
          <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-primary">Standard Klub Sukaria</span>
                <h2 className="font-display text-2xl uppercase">Fasilitas Resmi Cabang Ini</h2>
              </div>
              <span className="hidden text-sm text-muted-foreground sm:inline-block">Semua perlengkapan disanitasi tiap shift</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {facilityTypes
                .map((f) => ({ ...f, n: units.filter((u) => u.facility_type_id === f.facility_type_id).length }))
                .filter((f) => f.n > 0)
                .map((f) => (
                  <div key={f.facility_type_id} className="flex items-center gap-3 rounded-xl bg-muted p-3.5">
                    <Gamepad2 aria-hidden className="size-6 text-primary" />
                    <span className="text-sm">{f.name}</span>
                  </div>
                ))}
            </div>
          </section>

          {/* UNITS */}
          <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-primary">Daftar Konsol &amp; Booth</span>
                <h2 className="font-display text-2xl uppercase">Status Unit Cabang Ini</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/cabang/${branch.branch_id}`} className={`rounded-full border px-4 py-1.5 text-sm ${!type ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground transition-colors hover:text-foreground"}`}>
                  Semua ({units.length})
                </Link>
                {facilityTypes
                  .map((f) => ({ ...f, n: units.filter((u) => u.facility_type_id === f.facility_type_id).length }))
                  .filter((f) => f.n > 0)
                  .map((f) => (
                    <Link key={f.facility_type_id} href={`/cabang/${branch.branch_id}?type=${f.facility_type_id}`} className={`rounded-full border px-4 py-1.5 text-sm ${type === f.facility_type_id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground transition-colors hover:text-foreground"}`}>
                      {f.name} ({f.n})
                    </Link>
                  ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyState title="Belum ada unit di tipe ini" description="Coba pilih tipe unit lain atau lihat semua unit." />
            ) : (
              <div className="flex flex-col gap-4">
                {shown.map((u) => {
                  const free = nextFree.get(u.unit_id);
                  const rate = rates[u.facility_type_id];
                  return (
                    <div key={u.unit_id} className="rounded-2xl bg-muted p-5 transition-all duration-300 hover:bg-muted/80 hover:-translate-y-0.5">
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div className="flex items-start gap-4">
                          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <Gamepad2 className="size-8" />
                          </div>
                          <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="font-display text-xl uppercase">{u.name}</span>
                              <span className="rounded bg-card px-2 py-0.5 text-xs uppercase text-muted-foreground">{u.facility_types?.name}</span>
                              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs uppercase text-primary">{u.facility_types?.platform}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {facilityCopy(codeByType.get(u.facility_type_id) ?? "", EMPTY_COPY).desc}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              {u.status === "AVAILABLE" ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase text-primary">
                                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                  Available — Siap Main Sekarang
                                </span>
                              ) : free ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-400">
                                  Kosong pukul {fmtTime(free)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold uppercase text-muted-foreground">
                                  Slot penuh hari ini
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 md:flex-col md:items-end">
                          <div className="text-left md:text-right">
                            <span className="font-display text-2xl text-primary">{rate != null ? rp(rate) : "—"}</span>
                            <span className="text-sm text-muted-foreground"> / jam</span>
                          </div>
                          <Button asChild size="sm">
                            <Link href={`/booking?unit=${u.unit_id}&branch=${u.branch_id}`}>Booking Unit Ini</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* GAMES */}
          {hereGames.length > 0 && (
            <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
              <div className="mb-6">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-primary">Siap Main Tanpa Unduh</span>
                <h2 className="font-display text-2xl uppercase">Game Tersedia di Cabang Ini</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {hereGames.slice(0, 6).map((g) => (
                  <Link key={g.game_id} href={`/games/${g.slug}`} className="group min-w-0 transition-transform duration-300 hover:-translate-y-1">
                    <Cover seed={g.game_id} src={g.image_url} label={g.name} className="aspect-3/4 w-full rounded-lg border border-border transition-transform duration-500 group-hover:scale-105" />
                    <p className="mt-1.5 truncate font-display text-xs uppercase group-hover:text-primary">{g.name}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* SNACKS */}
          {snacks.length > 0 && (
            <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
              <div className="mb-6">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-primary">Pit-Stop Mumun Jabbar</span>
                <h2 className="font-display text-2xl uppercase">Snack &amp; Minuman (Stok Realtime)</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {snacks.slice(0, 6).map((s) => (
                  <div key={s.snack_id} className="rounded-xl border border-border bg-muted p-4 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40">
                    <Cover seed={s.snack_id} src={s.image_url} label={s.name} className="aspect-4/3 w-full rounded-lg border border-border transition-transform duration-500 group-hover:scale-105" />
                    <p className="mt-2 truncate text-sm font-medium">{s.name}</p>
                    <p className="text-sm text-primary">{rp(s.price)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* INFO ACCORDION */}
          <section className="rounded-2xl bg-card p-6 shadow-md md:p-8">
            <h2 className="mb-4 font-display text-2xl uppercase">Informasi &amp; Tata Tertib Cabang</h2>
            <details className="mb-3 rounded-xl bg-muted p-4">
              <summary className="cursor-pointer font-medium">Alamat &amp; Jam Operasional</summary>
              <p className="mt-2 text-sm text-muted-foreground">{branch.address} — Buka {branch.operating_hours}.</p>
            </details>
            <details className="mb-3 rounded-xl bg-muted p-4">
              <summary className="cursor-pointer font-medium">Kontak &amp; Booking</summary>
              <p className="mt-2 text-sm text-muted-foreground">Telepon: {branch.phone ?? "—"}. Booking via WhatsApp.</p>
            </details>
            <details className="rounded-xl bg-muted p-4">
              <summary className="cursor-pointer font-medium">Fasilitas Umum</summary>
              <p className="mt-2 text-sm text-muted-foreground">Musholla bersih, toilet nyaman, charging station, parkir luas.</p>
            </details>
          </section>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-6 lg:col-span-4">
          {/* STICKY BOOKING */}
          <div className="sticky top-24 rounded-2xl bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">Booking Instan</span>
              <span className="text-xs text-muted-foreground">Auto-Assign Cabang</span>
            </div>
            <h3 className="font-display text-2xl uppercase">Mau Main di Cabang Ini?</h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Amankan slot konsol sebelum datang. Form booking akan otomatis mengunci <strong className="text-foreground">{branch.name}</strong>.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Mulai Dari:</span>
              <span className="font-medium text-primary">{Number.isFinite(minRate) ? `${rp(minRate)} / jam` : "Hubungi kasir"}</span>
            </div>
            <Button asChild className="mt-4 w-full shadow-[0_4px_0_0_#003309] active:translate-y-1">
              <Link href={`/booking?branch=${branch.branch_id}`}>Booking Sekarang di Cabang Ini</Link>
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Send aria-hidden className="size-4 text-primary" /> Konfirmasi instan via WhatsApp Kasir
            </p>
          </div>

          {/* MAP PREVIEW */}
          <div className="rounded-2xl bg-card p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-2xl uppercase">Peta &amp; Rute</h3>
              <MapPin aria-hidden className="size-5 text-primary" />
            </div>
            <div className="grid h-56 place-items-center rounded-xl bg-muted">
              <div className="text-center">
                <MapPin aria-hidden className="mx-auto size-8 text-primary animate-bounce motion-reduce:animate-none" />
                <p className="mt-2 font-display text-lg uppercase">{branch.name}</p>
                <p className="text-xs text-primary">Buka {branch.operating_hours}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-muted p-3.5 text-sm">
              <span className="text-xs font-bold uppercase text-primary">Petunjuk Arah:</span>
              <p className="mt-1 text-muted-foreground">{branch.address}</p>
            </div>
            {mapsUrl && (
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href={mapsUrl} target="_blank" rel="noreferrer noopener">Buka di Google Maps</a>
              </Button>
            )}
          </div>

          {/* CONTACT */}
          <div className="rounded-2xl bg-card p-6 shadow-md">
            <h3 className="mb-4 font-display text-2xl uppercase">Kontak Kasir Standby</h3>
            <div className="flex items-center justify-between rounded-xl bg-muted p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-full bg-primary/20 text-primary">
                  <Phone aria-hidden className="size-5" />
                </div>
                <div>
                  <span className="block text-xs uppercase text-muted-foreground">WhatsApp Kasir</span>
                  <span className="font-medium">{branch.phone ?? "—"}</span>
                </div>
              </div>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90">
                  <Send aria-hidden className="size-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_COPY = {
  tag: "Unit Konsol",
  players: "Multi Player",
  desc: "Unit konsol dengan setup standar.",
  cta: "Booking Unit",
};
