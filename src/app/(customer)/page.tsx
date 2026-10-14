import Link from "next/link";
import {
  ArrowRight,
  Bolt,
  Eye,
  Gamepad2,
  MapPin,
  Radar,
  Timer,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ticker } from "@/components/ticker";
import { Cover } from "@/components/cover";
import { LiveUnits } from "@/components/live-units";
import { PlatformPill } from "@/components/kit/platform-pill";
import { StickerTag } from "@/components/kit/sticker-tag";
import { StatBlock } from "@/components/kit/stat-block";
import { PriceBadge } from "@/components/kit/price-badge";
import { SectionBanner } from "@/components/kit/section-banner";
import { StationCard } from "@/components/kit/station-card";
import { InstantBookingWidget } from "@/components/kit/instant-booking-widget";
import { HeroGamingAnimation } from "@/components/hero-gaming-animation";
import {
  getBranches,
  getFacilityTypes,
  getGames,
  getMinHourlyRates,
  getPromotions,
  getSnacks,
  getUnitsWithFacility,
} from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { getNextFreeMap } from "@/lib/next-free";
import { rp } from "@/lib/format";
import { facilityCopy } from "@/lib/facility-copy";

export default async function Home() {
  const [
    branches,
    units,
    facilityTypes,
    rates,
    games,
    snacks,
    promos,
  ] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getFacilityTypes(),
    getMinHourlyRates(),
    getGames(),
    getSnacks(),
    getPromotions(),
  ]);

  // Live monitor preview: first branch, up to 4 units, occupied ones get their
  // next-free slot via the same RPC /tempat-main uses.
  const monitorBranch = branches[0];
  const monitorUnits = monitorBranch
    ? units.filter((u) => u.branch_id === monitorBranch.branch_id).slice(0, 4)
    : [];
  const db = await createClient();
  const nextFree = await getNextFreeMap(db, monitorUnits);

  const availableTotal = units.filter((u) => u.status === "AVAILABLE").length;

  return (
    <>
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden border-b border-white/8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(60% 70% at 85% 15%, rgba(32,168,58,0.35), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="flex items-center gap-2">
            <StickerTag variant="green" rotate={-1.5}>
              <Bolt aria-hidden className="size-3" /> Buka 24 Jam
            </StickerTag>
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
              Tanjungpinang · {branches.map((b) => b.short_name ?? b.name).join(" & ")}
            </span>
          </div>

          <h1 className="font-display mt-5 text-5xl uppercase leading-[0.92] md:text-8xl">
            Main Sepuasnya.
            <br />
            <span className="text-primary">Gas Sesukamu.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base text-on-surface-variant md:text-lg">
            PS5, Nintendo Switch, game rame-rame, sampai tempat VIP. Tinggal pilih
            cabang, tentukan jam main, langsung booking tanpa antre.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/booking">
                Booking Sekarang <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/tempat-main">
                <Eye aria-hidden className="size-4" /> Lihat Tempat
              </Link>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap gap-x-10 gap-y-6">
            <StatBlock value={`${units.length}+`} label="Station PS5 & Rig" />
            <StatBlock value={`${games.length}+`} label="Katalog Game Top" />
            <StatBlock value={branches.length} label="Cabang Kota TPI" />
          </div>
        </div>
        <HeroGamingAnimation />
      </section>

      <Ticker
        items={[
          "PS5 · Switch · PSVR2",
          "Buka 24 Jam",
          "Tempat VIP & VVIP",
          "Mabar 4 Player",
          "Snack Bar Ready",
          "Sim Rig Gran Turismo",
          `${availableTotal} Unit Tersedia Sekarang`,
        ]}
      />

      {/* ---------- LIVE AVAILABILITY ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <SectionBanner
          kicker={
            <span className="inline-flex items-center gap-1.5">
              <Radar aria-hidden className="size-4" /> Live Availability Status
            </span>
          }
          title="Mau Main Sekarang?"
          description="Cek ketersediaan unit yang masih kosong secara real-time di kedua cabang Tanjungpinang sebelum jalan ke lokasi."
          action={
            <Button asChild variant="secondary">
              <Link href="/tempat-main">
                Semua Unit <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          }
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {branches.map((b) => {
            const mine = units.filter((u) => u.branch_id === b.branch_id);
            const ready = mine.filter((u) => u.status === "AVAILABLE");
            const byType = new Map<string, { ready: number; total: number }>();
            for (const u of mine) {
              const key = u.facility_types?.name ?? "Lainnya";
              const cur = byType.get(key) ?? { ready: 0, total: 0 };
              cur.total += 1;
              if (u.status === "AVAILABLE") cur.ready += 1;
              byType.set(key, cur);
            }
            return (
              <div
                key={b.branch_id}
                className="flex flex-col gap-3 rounded-xl border border-white/8 bg-card p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl uppercase leading-tight">
                      {b.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin aria-hidden className="size-3.5 shrink-0" />
                      {b.address}
                    </p>
                  </div>
                  <StickerTag variant="offwhite" rotate={2}>
                    Buka 24 Jam
                  </StickerTag>
                </div>
                <p className="text-sm">
                  <span className="font-display text-2xl text-primary">
                    {ready.length}
                  </span>
                  <span className="text-muted-foreground"> / {mine.length} unit tersedia</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...byType.entries()].map(([type, c]) => (
                    <span
                      key={type}
                      className="rounded-md border border-border bg-surface-low px-2 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-on-surface-variant"
                    >
                      {type}: {c.ready} Ready
                    </span>
                  ))}
                </div>
                <Link
                  href={`/cabang/${b.branch_id}`}
                  className="mt-auto inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                >
                  Lihat Slot {b.short_name ?? b.name}{" "}
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            );
          })}
        </div>

        {monitorBranch && monitorUnits.length > 0 && (
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg uppercase">
                Monitor Konsol Live ({monitorBranch.name})
              </h3>
              <span className="text-xs text-muted-foreground">Update otomatis</span>
            </div>
            <LiveUnits />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {monitorUnits.map((u) => (
                <StationCard
                  key={u.unit_id}
                  unit={u}
                  nextFree={nextFree.get(u.unit_id) ?? null}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- SETUP & FASILITAS ---------- */}
      <section className="border-y border-white/8 bg-surface-lowest">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <SectionBanner
            kicker="Setup & Fasilitas"
            title="Pilih Tempat Main"
            description="Dari sesi santai berdua sampai arena turnamen mabar komplit dengan sofa jumbo dan audio bioskop."
            action={
              <Button asChild variant="outline">
                <Link href="/tempat-main">
                  Detail Seluruh Tipe Room <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            }
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {facilityTypes.map((f, i) => {
              const copy = facilityCopy(f.code, {
                tag: f.platform,
                players: "Multi Player",
                desc: "Setup premium dengan perangkat orisinal dan kualitas broadcast.",
                cta: `Booking ${f.name}`,
              });
              const rate = rates[f.facility_type_id];
              // Break the equal-card row: the first type is a full-width banner.
              if (i === 0) {
                return (
                  <div
                    key={f.facility_type_id}
                    className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-card p-5 transition-colors hover:border-primary sm:col-span-2 sm:flex-row sm:items-center sm:gap-6 sm:p-6 lg:col-span-3"
                  >
                    <div className="min-w-0 sm:max-w-xs">
                      <StickerTag variant="outline" rotate={-1}>
                        {copy.tag}
                      </StickerTag>
                      <p className="font-display mt-3 text-3xl uppercase leading-tight">
                        {f.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                        <Users aria-hidden className="size-3.5" /> {copy.players}
                      </p>
                    </div>
                    <p className="text-sm text-on-surface-variant sm:flex-1">{copy.desc}</p>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      {rate !== undefined ? (
                        <PriceBadge>
                          Mulai <span className="font-display text-base">{rp(Math.round(rate))}</span>
                          /Jam
                        </PriceBadge>
                      ) : (
                        <PlatformPill platform={f.platform} />
                      )}
                      <Link
                        href={`/booking?branch=${branches[0]?.branch_id ?? ""}&type=${f.facility_type_id}`}
                        className="text-sm font-bold text-primary hover:underline"
                      >
                        {copy.cta} →
                      </Link>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={f.facility_type_id}
                  className="flex flex-col gap-3 rounded-xl border border-white/8 bg-card p-5 transition-colors hover:border-primary/50"
                >
                  <StickerTag variant="outline" rotate={-1}>
                    {copy.tag}
                  </StickerTag>
                  <div>
                    <p className="font-display text-2xl uppercase leading-tight">
                      {f.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
                      <Users aria-hidden className="size-3.5" /> {copy.players}
                    </p>
                  </div>
                  <p className="text-sm text-on-surface-variant">{copy.desc}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    {rate !== undefined ? (
                      <PriceBadge>
                        Mulai <span className="font-display text-base">{rp(Math.round(rate))}</span>
                        /Jam
                      </PriceBadge>
                    ) : (
                      <PlatformPill platform={f.platform} />
                    )}
                    <Link
                      href={`/booking?branch=${branches[0]?.branch_id ?? ""}&type=${f.facility_type_id}`}
                      className="text-sm font-bold text-primary hover:underline"
                    >
                      {copy.cta} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- KATALOG GAME ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <SectionBanner
          kicker="Katalog Game Terlengkap"
          title="Mau Main Apa Hari Ini?"
          description="Update terus tiap minggu. Stik lancar, game anti-lag, siap turnamen atau santai tamatin story."
          action={
            <Button asChild variant="secondary">
              <Link href="/games">
                Lihat {games.length}+ Koleksi <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          }
        />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {games.slice(0, 6).map((g) => {
            const availBranches = (g.game_availability ?? [])
              .filter((a) => a.available)
              .map((a) => {
                const b = branches.find((x) => x.branch_id === a.branch_id);
                return b?.short_name ?? b?.name;
              })
              .filter(Boolean);
            return (
              <Link
                key={g.game_id}
                href={`/games/${g.slug}`}
                className="group flex flex-col gap-2 rounded-xl border border-white/8 bg-card p-3 transition-colors hover:border-primary/50"
              >
                <Cover
                  seed={g.game_id}
                  src={g.image_url}
                  label={g.name}
                  className="aspect-[3/4] w-full rounded-lg text-[0.65rem]"
                />
                <p className="line-clamp-2 text-sm font-bold leading-tight">{g.name}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {availBranches.length ? availBranches.join(" & ") : "Cek cabang"}
                </p>
              </Link>
            );
          })}
        </div>
        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <Link href="/games">
              <Gamepad2 aria-hidden className="size-5" /> Jelajahi {games.length}+ Katalog Game
            </Link>
          </Button>
        </div>
      </section>

      {/* ---------- SNACK BAR ---------- */}
      <section className="border-y border-white/8 bg-surface-lowest">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <SectionBanner
            kicker="Sukaria Snack Bar 24 Jam"
            title={
              <>
                Ngegame Doang?? <span className="text-primary">Nyemil Juga Gasih??</span>
              </>
            }
            description="Temenin sesi mabar kamu biar nggak cuma controller yang kerja. Order langsung diantar ke meja console-mu!"
            action={
              <Button asChild variant="outline">
                <Link href="/snacks">
                  Lihat Cemilan Lengkap <ArrowRight aria-hidden className="size-4" />
                </Link>
              </Button>
            }
          />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {snacks.slice(0, 6).map((s) => (
              <div
                key={s.snack_id}
                className="flex flex-col gap-2 rounded-xl border border-white/8 bg-card p-3"
              >
                <Cover
                  seed={s.snack_id}
                  src={s.image_url}
                  label={s.category}
                  className="aspect-[4/3] w-full rounded-lg text-[0.65rem]"
                />
                <p className="line-clamp-2 text-sm font-bold leading-tight">{s.name}</p>
                <p className="font-display text-lg text-primary">{rp(s.price)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- PROMO ---------- */}
      {promos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <SectionBanner
            kicker={
              <span className="inline-flex items-center gap-1.5">
                <Timer aria-hidden className="size-4" /> Diskon Hemat
              </span>
            }
            title="Edisi Begadang Tanjungpinang"
            description="Ambil paket hemat main berturut-turut. Sudah termasuk bonus minuman botol dingin dan cemilan."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {promos.slice(0, 2).map((p) => {
              const cheapest = p.promotion_items
                .map((i) => i.price)
                .sort((a, b) => a - b)[0];
              return (
                <div
                  key={p.promotion_id}
                  className="relative overflow-hidden rounded-xl border border-white/8 bg-card p-6"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 opacity-20"
                    style={{
                      backgroundImage:
                        "radial-gradient(50% 60% at 100% 0%, rgba(32,168,58,0.5), transparent 70%)",
                    }}
                  />
                  <StickerTag variant="green" rotate={-2}>
                    {p.name}
                  </StickerTag>
                  <p className="mt-4 text-sm text-on-surface-variant">
                    {p.description ?? "Paket hemat sesi mabar kamu."}
                  </p>
                  {cheapest !== undefined && (
                    <p className="mt-4">
                      <span className="font-display text-4xl text-primary">
                        {rp(cheapest)}
                      </span>
                      <span className="text-sm text-muted-foreground"> mulai dari</span>
                    </p>
                  )}
                  <Button asChild className="mt-5">
                    <Link href="/promo">Klaim Promo Ini</Link>
                  </Button>
                </div>
              );
            })}
        </div>
      </section>
      )}

      {/* ---------- INSTANT BOOKING DISPATCH ---------- */}
      <section className="border-t border-white/8 bg-surface-lowest">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <SectionBanner
            kicker="Instant Booking Dispatch"
            title="Gak Mau Kehabisan Slot Jam Favorit?"
            description="Pilih cabang dan tipe ruang, sistem kami langsung alokasikan konsol terbaik untukmu."
          />
          <div className="mt-8 rounded-xl border border-white/8 bg-card p-5 md:p-6">
            <InstantBookingWidget
              branches={branches.map((b) => ({
                value: b.branch_id,
                label: `${b.name}${b.address ? ` (${b.address})` : ""}`,
              }))}
              facilityTypes={facilityTypes.map((f) => ({
                value: f.facility_type_id,
                label: `${f.name} (${f.platform})`,
              }))}
            />
          </div>
        </div>
      </section>
    </>
  );
}
