import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import { ArrowRight, Gift, Plus, Radio, Swords, TriangleAlert, Trophy, Users, Wallet, Flame, ExternalLink } from "lucide-react";
import { getBranches, getGames } from "@/lib/catalog";
import { getAdminTournaments } from "@/lib/tournaments-admin";
import { getStaffUser } from "@/lib/authz";
import { TournamentEditor, type TournamentRow } from "@/components/admin/tournament-editor";
import { StatCards } from "@/components/stat-cards";
import { EmptyState } from "@/components/empty-state";
import { TOURNAMENT_STATUS_LABEL, feeDisplay } from "@/lib/tournament-rules";
import { rp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  Tampilan status: warna + teks (tidak pernah warna saja)                    */
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

const STRIPE: Record<Tone, string> = {
  success: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  neutral: "bg-muted-foreground/40",
};

const label = (status: string) =>
  (TOURNAMENT_STATUS_LABEL as Record<string, string>)[status] ?? status;

/** Header ringkas satu turnamen: status, kursi, uang, dan pintu ke peserta & bracket. */
function TournamentHeader({
  id,
  status,
  quota,
  held,
  paid,
  revenue,
  free,
  fee,
}: {
  id: string;
  status: string;
  quota: number;
  held: number;
  paid: number;
  revenue: number;
  free: boolean;
  fee: number;
}) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const pct = quota > 0 ? Math.min(100, Math.round((held / quota) * 100)) : 0;
  const unpaid = Math.max(0, held - paid);
  const left = Math.max(0, quota - held);
  const almostFull = status === "OPEN" && quota > 0 && pct >= 80;
  const live = status === "ONGOING";

  return (
    <div className="group relative isolate overflow-hidden rounded-xl border border-border bg-card p-4 pl-5 transition-colors hover:border-primary/40">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STRIPE[tone], live && "animate-pulse")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
              PILL[tone],
            )}
          >
            {live ? (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
            ) : (
              <span aria-hidden className="size-2 rounded-full bg-current" />
            )}
            {label(status)}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
              free ? "border-amber/40 bg-amber/10 text-amber" : "border-border text-muted-foreground",
            )}
          >
            {free ? <Gift aria-hidden className="size-3.5" /> : <Wallet aria-hidden className="size-3.5" />}
            {free ? "HTM gratis" : `HTM ${rp(fee)}`}
          </span>

          {almostFull && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-bold uppercase text-amber">
              <Flame aria-hidden className="size-3.5" /> Hampir penuh · sisa {left}
            </span>
          )}
        </div>

        <Link
          href={`/admin/turnamen/${id}`}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold uppercase tracking-wide text-primary-foreground transition-transform hover:scale-105"
        >
          Kelola peserta &amp; bracket
          <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Kursi: bar terisi + rincian */}
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <div className="flex items-end justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kursi terisi</p>
            <p className="font-display text-2xl leading-none tabular-nums">
              {held}
              <span className="text-sm text-muted-foreground">/{quota}</span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quota}
            aria-valuenow={held}
            aria-label={`Kursi terisi ${held} dari ${quota}`}
            className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          >
            {/* lunas (penuh) + menunggu bayar (setengah) dalam satu bar */}
            <div className="h-full bg-primary" style={{ width: `${quota > 0 ? Math.min(100, (paid / quota) * 100) : 0}%` }} />
            <div className="h-full bg-amber/70" style={{ width: `${quota > 0 ? Math.min(100 - (paid / quota) * 100, (unpaid / quota) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary" /> {paid} lunas
            </span>
            {unpaid > 0 && (
              <span className="inline-flex items-center gap-1 text-amber">
                <span className="size-2 rounded-full bg-amber/70" /> {unpaid} menunggu bayar
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-muted-foreground/30" /> {left} kosong
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/60 px-4 py-2 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">HTM terkumpul</p>
          <p className="font-display text-xl tabular-nums text-primary">{rp(revenue)}</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tournament management.
 *
 * Every status is listed, not only the public ones — a panel that hid a draft would make
 * it look as though the tournament did not exist. The sweep of expired seats runs on the
 * read path (the route does it), so the counters here are the real ones.
 *
 * Open to every active role, the way the GET list route is: a STAFF profile reads only
 * its own branch's tournaments and works them from the detail page (registrations,
 * bracket). The create/edit forms belong to OWNER/ADMIN — mirroring the POST/PATCH
 * guard on the route — so they are not rendered for STAFF at all, and neither is the
 * branch/game master data that feeds their pickers.
 */
export default async function AdminTournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;

  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div>
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <div className="mt-6">
          <EmptyState title="Sesi tidak aktif" description="Muat ulang halaman untuk melanjutkan." />
        </div>
      </div>
    );
  }

  // null = OWNER/ADMIN, every outlet. "" = a STAFF profile without a placement:
  // refuse up front instead of showing numbers the counter can never operate on.
  const lockedBranchId = me.role === "STAFF" ? me.branch_id ?? "" : null;
  if (lockedBranchId === "") {
    return (
      <div>
        <h1 className="font-display text-2xl uppercase">Turnamen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atur jadwal, kuota, HTM, dan poster. Pelanggan hanya melihat status OPEN, FULL, ONGOING, dan DONE.
        </p>
        <div className="mt-6">
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi daftar turnamen tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  const canManage = me.role === "OWNER" || me.role === "ADMIN";
  const [admin, branches, games] = await Promise.all([
    getAdminTournaments(lockedBranchId ? { branchId: lockedBranchId } : undefined),
    canManage ? getBranches() : Promise.resolve([]),
    canManage ? getGames() : Promise.resolve([]),
  ]);
  const { tournaments, swept } = admin;

  const branchOptions = branches.map((b) => ({ id: b.branch_id, label: b.short_name ?? b.name }));
  const gameOptions = games.map((g) => ({ id: g.game_id, label: g.name }));

  /* ---- angka ringkasan (semua dari data yang sudah ada, tanpa query baru) ---- */
  const live = tournaments.filter((t) => t.status !== "DRAFT" && t.status !== "CANCELLED").length;
  const seats = tournaments.reduce((sum, t) => sum + t.stats.held, 0);
  const revenue = tournaments.reduce((sum, t) => sum + t.stats.revenue, 0);

  // Isi kursi dihitung dari turnamen yang masih "hidup" saja: draft & batal tidak
  // punya peserta yang berarti dan menarik persentase turun tanpa alasan.
  const running = tournaments.filter((t) => t.status !== "DRAFT" && t.status !== "CANCELLED");
  const runningQuota = running.reduce((sum, t) => sum + t.quota, 0);
  const runningHeld = running.reduce((sum, t) => sum + t.stats.held, 0);
  const fillRate = runningQuota > 0 ? Math.round((runningHeld / runningQuota) * 100) : 0;
  const unpaidSeats = tournaments.reduce((sum, t) => sum + Math.max(0, t.stats.held - t.stats.paid), 0);

  const byStatus = new Map<string, number>();
  for (const t of tournaments) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);

  const knownStatuses = Object.keys(TOURNAMENT_STATUS_LABEL);
  const activeStatus = statusParam && knownStatuses.includes(statusParam) ? statusParam : undefined;
  const visible = activeStatus ? tournaments.filter((t) => t.status === activeStatus) : tournaments;

  const chipBase =
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors";

  return (
    <div className="space-y-6">
      {/* ============================ HERO ============================ */}
      <PageHero
        size="admin"
        eyebrow={{ icon: Swords, label: `Arena · ${live} tayang` }}
        title={
          <>
            Turnamen <span className="text-primary">🏆</span>
          </>
        }
        titleIcon={Trophy}
        description={
          <>
            Atur jadwal, kuota, HTM, dan poster. Pelanggan hanya melihat status OPEN, FULL, ONGOING, dan DONE.
            {swept > 0 && (
              <p className="mt-3 flex w-fit items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                <TriangleAlert aria-hidden className="size-3.5" />
                {swept} pendaftaran kedaluwarsa dilepas kali ini
              </p>
            )}
          </>
        }
        actions={
          <>
            {canManage && (
              <a
                href="#turnamen-baru"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
              >
                <Plus aria-hidden className="size-4" /> Turnamen baru
              </a>
            )}
            <Link
              href="/turnamen"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <ExternalLink aria-hidden className="size-4" /> Halaman publik
            </Link>
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Keterisian kursi</p>
              <p className="font-display text-5xl leading-none tabular-nums text-primary">
                {fillRate}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={fillRate}
              aria-label={`Keterisian kursi ${fillRate} persen`}
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fillRate}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {runningHeld} dari {runningQuota} kursi di turnamen yang tayang
              {unpaidSeats > 0 && <span className="text-amber"> · {unpaidSeats} belum lunas</span>}
            </p>
          </div>
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0!"
        cards={[
          { label: "Total", value: tournaments.length, icon: Trophy, hint: "semua status" },
          {
            label: "Tayang",
            value: live,
            tone: live > 0 ? "primary" : "warning",
            icon: Radio,
            hint: live > 0 ? "terlihat oleh pelanggan" : "belum ada yang tayang",
          },
          {
            label: "Kursi terisi",
            value: seats,
            icon: Users,
            hint: unpaidSeats > 0 ? `${unpaidSeats} menunggu bayar` : "semua sudah lunas",
          },
          { label: "HTM terkumpul", value: rp(revenue), tone: "primary", icon: Wallet },
        ]}
      />

      {/* ===================== CHIP FILTER STATUS ===================== */}
      {tournaments.length > 0 && (
        <nav aria-label="Filter status turnamen" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link
            href="/admin/turnamen"
            aria-current={!activeStatus ? "true" : undefined}
            className={cn(
              chipBase,
              !activeStatus
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
            )}
          >
            Semua
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                !activeStatus ? "bg-primary-foreground/20" : "bg-muted",
              )}
            >
              {tournaments.length}
            </span>
          </Link>
          {knownStatuses
            .filter((s) => byStatus.get(s))
            .map((s) => {
              const active = activeStatus === s;
              return (
                <Link
                  key={s}
                  href={`/admin/turnamen?status=${s}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    chipBase,
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-foreground",
                  )}
                >
                  {label(s)}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted",
                    )}
                  >
                    {byStatus.get(s)}
                  </span>
                </Link>
              );
            })}
        </nav>
      )}

      {/* ========================= DAFTAR TURNAMEN ===================== */}
      <div className="space-y-5">
        {tournaments.length === 0 && (
          <EmptyState
            title="Belum ada turnamen"
            description={
              canManage
                ? "Buat turnamen pertama lewat form di bawah. Mulai sebagai DRAFT dulu, tayangkan kalau sudah siap."
                : "Belum ada turnamen di cabangmu."
            }
          />
        )}

        {tournaments.length > 0 && visible.length === 0 && (
          <EmptyState
            title="Tidak ada turnamen dengan status ini"
            actionHref={{ label: "Tampilkan semua", href: "/admin/turnamen" }}
          />
        )}

        {visible.map((t) => (
          <div key={t.tournament_id} className="space-y-2">
            <TournamentHeader
              id={t.tournament_id}
              status={t.status}
              quota={t.quota}
              held={t.stats.held}
              paid={t.stats.paid}
              revenue={t.stats.revenue}
              free={feeDisplay(t).kind === "free"}
              fee={t.registration_fee}
            />
            {canManage && (
              <TournamentEditor
                tournament={t as TournamentRow}
                branchOptions={branchOptions}
                gameOptions={gameOptions}
              />
            )}
          </div>
        ))}

        {canManage && (
          <section id="turnamen-baru" className="scroll-mt-24">
            <div className="mb-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Plus aria-hidden className="size-4 text-primary" /> Turnamen baru
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <TournamentEditor branchOptions={branchOptions} gameOptions={gameOptions} />
          </section>
        )}
      </div>
    </div>
  );
}