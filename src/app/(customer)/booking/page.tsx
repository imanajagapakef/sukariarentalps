import { PageHero } from "@/components/page-hero";
import {
  CalendarDays,
  Clock,
  Gamepad2,
  MapPin,
  Monitor,
  Sandwich,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  UserRound,
  Zap,
} from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getBranches, getGames, getPromoOfferings, getSnacks, getUnitsWithFacility } from "@/lib/catalog";
import { BookingForm } from "@/components/booking-form";
import { BookingHeroAnimation } from "@/components/booking-hero-animation";

export const metadata: Metadata = {
  title: "Booking",
  description: "Pesan sesi PS di SukaRia Rental PS — pilih tempat, waktu, lalu isi data kamu.",
};

// No `export const revalidate` here on purpose. Reading `searchParams` (below) makes this
// route dynamic, so a route-level revalidate window never applied to it in the first
// place. Data freshness is decided where the reads happen: `lib/catalog.ts`, which keeps
// branches on the 300 s fetch cache and reads unit status, stock and games live.

const STEPS = [
  { n: 1, label: "Tempat", hint: "Cabang & unit", icon: MapPin },
  { n: 2, label: "Waktu", hint: "Tanggal & durasi", icon: Clock },
  { n: 3, label: "Data kamu", hint: "Nama & kontak", icon: UserRound },
] as const;

const PERKS = [
  { icon: Clock, text: "Buka 24 jam" },
  { icon: Zap, text: "Konfirmasi cepat" },
  { icon: ShieldCheck, text: "Tanpa ribet akun" },
] as const;

/** Preview of the 3 steps. Pure server markup, no state: the real stepper lives in
 *  BookingForm. This only sets expectations, so the user knows the whole job is small. */
function StepsPreview() {
  return (
    <ol className="mt-6 grid grid-cols-3 gap-2 sm:gap-3" aria-label="Alur booking">
      {STEPS.map(({ n, label, hint, icon: Icon }, i) => (
        <li
          key={n}
          className="group relative overflow-hidden rounded-xl bg-card p-3 ring-1 ring-foreground/10 transition duration-300 hover:-translate-y-0.5 hover:ring-primary/40 sm:p-4"
        >
          <span
            aria-hidden
            className="absolute -right-2 -top-4 font-display text-6xl leading-none text-primary/10 transition group-hover:text-primary/20"
          >
            {n}
          </span>
          <span className="relative grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden className="size-4" />
          </span>
          <p className="relative mt-2 text-sm font-semibold leading-tight">{label}</p>
          <p className="relative hidden text-xs text-muted-foreground sm:block">{hint}</p>
          {i < STEPS.length - 1 && (
            <span
              aria-hidden
              className="absolute right-0 top-1/2 hidden h-px w-3 bg-primary/40 sm:block"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Same silhouette as the real form (stepper row, then a card with a heading, one field,
 *  and a unit grid) so the layout does not jump when the server work resolves. */
function BookingSkeleton() {
  return (
    <div className="mt-8 space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Memuat form booking…</span>
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10" aria-hidden>
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function BookingPage({
  searchParams,
}: {
  // `type` and `slot` are what the home-page instant-booking widget sends; they
  // used to be dropped on the floor here. `promo` and `duration` come from clicking a
  // package on /promo, so the form opens already pinned to what that promo covers.
  searchParams: Promise<{
    unit?: string;
    branch?: string;
    type?: string;
    slot?: string;
    promo?: string;
    duration?: string;
  }>;
}) {
  const { unit, branch, type, slot, promo, duration } = await searchParams;
  const [branches, units, snacks, games, promoOfferings] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getSnacks(),
    // Fresh, not the 300 s browse cache: `game_availability` decides which games this
    // branch can offer, and offering one that was just switched off is the exact bug
    // the instant-booking widget cannot recover from.
    getGames({ revalidate: 0 }),
    getPromoOfferings(),
  ]);

  // A hand-edited URL should not be able to put the form in a state it cannot recover
  // from, so an unparseable duration is dropped rather than passed on as NaN. This bound
  // is only the first line of defence: the branch's own rules (min/max/interval) are not
  // known until the form has fetched them, so BookingForm checks the value against
  // `durationOptions(cfg)` once cfg lands.
  const requestedDuration = duration ? Number(duration) : NaN;
  const initialDuration =
    Number.isFinite(requestedDuration) && requestedDuration > 0 && requestedDuration <= 1440
      ? requestedDuration
      : undefined;

  // Same principle for ids: a stale or mistyped ?unit= / ?branch= is dropped here instead
  // of reaching the form as a pin on something that does not exist. A valid unit also
  // implies its branch, so a link with only ?unit= still lands on the right outlet.
  const pinnedUnit = unit ? units.find((u) => String(u.unit_id) === unit) : undefined;
  const pinnedBranch = branch ? branches.find((b) => String(b.branch_id) === branch) : undefined;
  const initialUnit = pinnedUnit ? unit : undefined;
  const initialBranch = pinnedBranch
    ? branch
    : pinnedUnit
      ? String(pinnedUnit.branch_id)
      : undefined;

  // Arrived with something pre-filled (promo card, home widget, unit link)? Say so, so
  // the pre-filled form reads as a favour, not a surprise.
  const arrivedPrefilled = Boolean(promo || initialUnit || slot);

  // Only the fields the form renders are serialized into the RSC payload.
  const formBranches = branches.map((b) => ({ branch_id: b.branch_id, name: b.short_name ?? b.name }));
  const formUnits = units.map((u) => ({
    unit_id: u.unit_id,
    name: u.name,
    status: u.status,
    branch_id: u.branch_id,
    facility_type_id: u.facility_type_id,
    facility_types: u.facility_types
      ? { name: u.facility_types.name, category: u.facility_types.category }
      : null,
  }));
  const formSnacks = snacks.map((s) => ({ snack_id: s.snack_id, name: s.name, price: s.price, stock: s.stock, min_stock: s.min_stock }));
  const formGames = games.map((g) => ({
    game_id: g.game_id,
    name: g.name,
    game_availability: g.game_availability.map((a) => ({ branch_id: a.branch_id, available: a.available })),
  }));

  return (
    <div className="relative mx-auto max-w-4xl px-4 py-10 md:px-8">
      {/* Ambient glow behind the hero: CSS only, no layout cost. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-72 bg-[radial-gradient(40rem_14rem_at_50%_0%,theme(colors.primary/15%),transparent)]"
      />

      {/* BookingHeroAnimation is decoration only, so it stays hidden on phones where it
          would compete with the form for the first screen. */}
      <PageHero
        eyebrow={{ icon: Sparkles, label: "3 langkah" }}
        title="Booking"
        titleIcon={CalendarDays}
        description="Tiga langkah: tempat, waktu, data kamu."
        aside={<BookingHeroAnimation className="hidden h-24 w-full shrink-0 md:block md:h-36 md:w-90" />}
      />

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Keunggulan">
        {PERKS.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10"
          >
            <Icon aria-hidden className="size-3.5 text-primary" />
            {text}
          </li>
        ))}
      </ul>

      {arrivedPrefilled && (
        <p
          role="status"
          className="mt-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary ring-1 ring-primary/25"
        >
          <Ticket aria-hidden className="size-4 shrink-0" />
          Pilihanmu sudah kami isi di form. Cek lagi, lalu lanjut.
        </p>
      )}

      <StepsPreview />

      <StatCards
        cards={[
          { label: "Cabang", value: branches.length, icon: Store, hint: "pilih lokasi" },
          { label: "Unit", value: units.length, icon: Monitor, hint: "pilih ruang" },
          { label: "Game", value: games.length, icon: Gamepad2, hint: "siap dimainkan" },
          { label: "Snack", value: snacks.length, icon: Sandwich, hint: "bisa ditambah" },
        ]}
      />

      {branches.length === 0 ? (
        // Nothing to book at: an empty form would be a dead end, so say it plainly.
        <div className="mt-8 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <Store aria-hidden className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">Belum ada cabang yang bisa dibooking</p>
          <p className="mt-1 text-sm text-muted-foreground">Coba lagi sebentar lagi, atau hubungi kami langsung.</p>
        </div>
      ) : (
        <Suspense fallback={<BookingSkeleton />}>
          <BookingForm
            branches={formBranches}
            units={formUnits}
            snacks={formSnacks}
            games={formGames}
            initialUnit={initialUnit}
            initialBranch={initialBranch}
            initialType={type}
            initialSlot={slot}
            promoOfferings={promoOfferings}
            initialPromo={promo}
            initialDuration={initialDuration}
          />
        </Suspense>
      )}
    </div>
  );
}