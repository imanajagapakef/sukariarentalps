import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  ExternalLink,
  Gift,
  Hourglass,
  Network,
  Swords,
  Trophy,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { getTournamentAdminDetail } from "@/lib/tournaments-admin";
import { getStaffUser } from "@/lib/authz";
import { TournamentRegistrationTable } from "@/components/admin/tournament-registrations";
import { TournamentBracketAdmin } from "@/components/admin/tournament-bracket-admin";
import { StatCards } from "@/components/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { TOURNAMENT_STATUS_LABEL, feeDisplay } from "@/lib/tournament-rules";
import { fmtDateTime, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

type Tone = "success" | "warning" | "danger" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  OPEN: "success",
  ONGOING: "success",
  FULL: "warning",
  DRAFT: "neutral",
  DONE: "neutral",
  CANCELLED: "danger",
};

const PILL: Record<Tone, string> = {
  success: "border-primary/40 bg-primary/12 text-primary",
  warning: "border-amber/40 bg-amber/12 text-amber",
  danger: "border-coral/40 bg-coral/12 text-coral",
  neutral: "border-border bg-muted text-muted-foreground",
};

/**
 * Sisa waktu menuju mulai, dirender server. Jam absolut tampil di sebelahnya karena
 * teks relatif bisa basi sampai refresh berikutnya.
 */
function startHint(startIso: string, nowMs: number) {
  const minutes = Math.round((Date.parse(startIso) - nowMs) / 60_000);
  if (minutes <= 0) return { text: "sudah dimulai", soon: false, past: true };
  if (minutes < 60) return { text: `mulai ${minutes} menit lagi`, soon: true, past: false };
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    return { text: `mulai ${h} jam ${minutes % 60} mnt lagi`, soon: h < 3, past: false };
  }
  return { text: `mulai ${Math.floor(minutes / 1440)} hari lagi`, soon: false, past: false };
}

/** Satu anak tangga corong: label, jumlah, dan bar relatif terhadap kuota. */
function FunnelStep({
  icon: Icon,
  label,
  value,
  quota,
  bar,
  text,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  quota: number;
  bar: string;
  text: string;
}) {
  const pct = quota > 0 ? Math.min(100, Math.round((value / quota) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon aria-hidden className={cn("size-3.5", text)} />
          {label}
        </span>
        <span className="font-display text-lg leading-none tabular-nums">
          {value}
          <span className="text-xs text-muted-foreground">/{quota}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={value}
        aria-label={`${label} ${value} dari ${quota}`}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * One tournament, from the counter's side: who registered, who paid, who is here, and
 * the bracket with a box to type each score into.
 *
 * Uncached on purpose — this is the page open on the counter while people queue up.
 *
 * GET is open to every active role, but a cross-branch id must not ride the URL in:
 * a STAFF profile reads its own branch only, and any other id resolves to a 404 —
 * the same fence the registrations/matches routes enforce with a 403, without
 * revealing that the tournament exists.
 */
export default async function AdminTournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div>
          <EmptyState title="Sesi tidak aktif" description="Muat ulang halaman untuk melanjutkan." />
        </div>
      </div>
    );
  }

  // null = OWNER/ADMIN, every outlet. "" = a STAFF profile without a placement:
  // no branch to match a tournament against, so the detail cannot be opened at all.
  const lockedBranchId = me.role === "STAFF" ? me.branch_id ?? "" : null;
  if (lockedBranchId === "") {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div>
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi detail turnamen tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  const { tournament, registrations, matches } = await getTournamentAdminDetail(
    id,
    lockedBranchId ? { branchId: lockedBranchId } : undefined,
  );
  if (!tournament) notFound();

  const paid = registrations.filter((r) => r.status === "PAID" || r.status === "CHECKED_IN");
  const unpaid = registrations.filter((r) => r.status === "WAITING_PAYMENT");
  const checkedIn = registrations.filter((r) => r.status === "CHECKED_IN");
  const revenue = paid.reduce((sum, r) => sum + r.fee_amount, 0);
  const fee = feeDisplay(tournament);

  const seatsTaken = paid.length + unpaid.length;
  const notYetHere = Math.max(0, paid.length - checkedIn.length);
  const seatsLeft = Math.max(0, tournament.quota - seatsTaken);
  const matchCount = Array.isArray(matches) ? matches.length : 0;

  const tone = STATUS_TONE[tournament.status] ?? "neutral";
  const live = tournament.status === "ONGOING";
  const when = startHint(tournament.starts_at, Date.now());

  // Apa yang paling perlu dikerjakan kasir SEKARANG, dari angka yang sudah ada.
  const todo: { key: string; text: string; tone: Tone }[] = [];
  if (unpaid.length > 0)
    todo.push({ key: "unpaid", text: `${unpaid.length} peserta belum bayar — terima pembayaran di kasir`, tone: "warning" });
  if (notYetHere > 0 && (when.soon || when.past || live))
    todo.push({ key: "absent", text: `${notYetHere} peserta lunas belum check-in`, tone: "warning" });
  if (matchCount === 0 && paid.length >= 2 && (when.past || live))
    todo.push({ key: "bracket", text: "Turnamen sudah jalan tapi bracket masih kosong", tone: "danger" });

  return (
    <div className="space-y-6">
      {/* ============================ HERO ============================ */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div aria-hidden className="absolute -right-16 -top-24 -z-10 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 left-1/4 -z-10 size-56 rounded-full bg-amber/10 blur-3xl" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />
        <Trophy
          aria-hidden
          className="absolute -bottom-6 right-6 -z-10 hidden size-40 -rotate-12 text-primary opacity-[0.07] sm:block"
        />

        <Link
          href="/admin/turnamen"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" /> Semua turnamen
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
                  PILL[tone],
                )}
              >
                {live ? (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <Swords aria-hidden className="size-3.5" />
                )}
                {TOURNAMENT_STATUS_LABEL[tournament.status]}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
                  fee.kind === "free" ? "border-amber/40 bg-amber/10 text-amber" : "border-border text-muted-foreground",
                )}
              >
                {fee.kind === "free" ? <Gift aria-hidden className="size-3.5" /> : <Wallet aria-hidden className="size-3.5" />}
                {fee.kind === "free" ? "HTM gratis" : `HTM ${rp(fee.amount)}`}
              </span>
            </div>

            <h1 className="font-display mt-3 text-3xl uppercase leading-tight sm:text-4xl">{tournament.title}</h1>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock aria-hidden className="size-4" />
                {fmtDateTime(tournament.starts_at)}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                  when.soon ? "bg-amber/15 text-amber" : when.past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {when.text}
              </span>
            </p>

            {tournament.prize && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/10 px-3 py-1.5 text-sm">
                <Trophy aria-hidden className="size-4 text-amber" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Hadiah</span>
                <b className="text-foreground">{tournament.prize}</b>
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="#peserta"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
              >
                <Users aria-hidden className="size-4" /> Peserta
              </a>
              <a
                href="#bracket"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
              >
                <Network aria-hidden className="size-4" /> Bracket
              </a>
              <Link
                href={`/turnamen/${tournament.slug}`}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
              >
                <ExternalLink aria-hidden className="size-4" /> Halaman publik
              </Link>
            </div>
          </div>

          {/* Corong pendaftaran */}
          <div className="w-full space-y-3 sm:w-72">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Corong peserta</p>
            <FunnelStep icon={Users} label="Terdaftar" value={seatsTaken} quota={tournament.quota} bar="bg-amber/70" text="text-amber" />
            <FunnelStep icon={CircleCheck} label="Lunas" value={paid.length} quota={tournament.quota} bar="bg-primary" text="text-primary" />
            <FunnelStep icon={UserCheck} label="Hadir" value={checkedIn.length} quota={tournament.quota} bar="bg-primary/60" text="text-primary" />
            <p className="text-[11px] text-muted-foreground">
              {seatsLeft > 0 ? `${seatsLeft} kursi masih kosong` : "Kursi penuh"}
            </p>
          </div>
        </div>
      </section>

      {/* ======================= PERLU DIKERJAKAN ===================== */}
      {todo.length > 0 && (
        <section
          aria-label="Perlu dikerjakan"
          className={cn(
            "rounded-2xl border p-4",
            todo.some((t) => t.tone === "danger") ? "border-coral/40 bg-coral/5" : "border-amber/40 bg-amber/5",
          )}
        >
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <Hourglass aria-hidden className="size-4 text-amber" /> Perlu Dikerjakan
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todo.map((t) => (
              <li key={t.key}>
                <a
                  href={t.key === "bracket" ? "#bracket" : "#peserta"}
                  className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm transition-colors hover:text-primary"
                >
                  <span>{t.text}</span>
                  <span aria-hidden>→</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0!"
        cards={[
          {
            label: "Kursi terisi",
            value: `${seatsTaken}/${tournament.quota}`,
            icon: Users,
            hint: seatsLeft > 0 ? `${seatsLeft} kursi kosong` : "kursi penuh",
          },
          { label: "Lunas", value: paid.length, tone: "primary", icon: CircleCheck, hint: "sudah bayar HTM" },
          {
            label: "Belum bayar",
            value: unpaid.length,
            tone: unpaid.length > 0 ? "warning" : "muted",
            icon: Hourglass,
            hint: unpaid.length > 0 ? "tagih di kasir" : "tidak ada tunggakan",
          },
          {
            label: "Hadir",
            value: checkedIn.length,
            icon: UserCheck,
            hint: notYetHere > 0 ? `${notYetHere} lunas belum hadir` : "semua lunas sudah hadir",
          },
          { label: "HTM masuk", value: rp(revenue), tone: "primary", icon: Wallet, hint: `${paid.length} peserta lunas` },
        ]}
      />

      {/* =========================== PESERTA ========================== */}
      <section id="peserta" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
            Peserta
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {registrations.length} pendaftar
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Terima pembayaran di kasir, tandai hadir, atau batalkan kalau tidak datang.
        </p>
        <div className="mt-3">
          <TournamentRegistrationTable
            tournamentId={tournament.tournament_id}
            registrations={registrations}
          />
        </div>
      </section>

      {/* =========================== BRACKET ========================== */}
      <section id="bracket" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span>
            Bracket
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {matchCount} pertandingan
          </span>
        </div>
        <div className="mt-3">
          <TournamentBracketAdmin
            tournamentId={tournament.tournament_id}
            matches={matches}
            registrations={registrations}
          />
        </div>
      </section>
    </div>
  );
}