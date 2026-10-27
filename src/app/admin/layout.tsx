import Link from "next/link";
import { CalendarDays, ShieldAlert, Wallet, Zap } from "lucide-react";
import { getStaffUser } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "@/components/logout-button";
import { AdminNav, AdminNavMobile } from "@/components/admin/admin-nav";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { countWaitingPayment } from "@/lib/bookings-query";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Admin — Klub Sukaria" };

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", STAFF: "Staff" };

// Visual only: scoping is enforced server-side per request. ADMIN may manage STAFF
// accounts (create + active toggle); role and branch edits stay OWNER-only.
const STAFF_HIDDEN = [
  "/admin/games",
  "/admin/pricing",
  "/admin/promos",
  "/admin/branches",
  "/admin/users",
  "/admin/audit-log",
] as const;

/** Jam di WIB (UTC+7), bukan jam server. Server di Vercel biasanya UTC. */
function wibHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(now);
  return Number(h) % 24; // beberapa engine mengembalikan "24" untuk tengah malam
}

function greetingFor(h: number): string {
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Shift mengikuti jam nyata, bukan label "Shift Malam" yang dikunci mati. */
function shiftFor(h: number) {
  const night = h >= 20 || h < 8;
  return night
    ? { label: "Shift Malam", range: "20:00 - 08:00 WIB" }
    : { label: "Shift Siang", range: "08:00 - 20:00 WIB" };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : (parts[0]![1] ?? "");
  return (first + last).toUpperCase();
}

function Avatar({ name, className = "size-9" }: Readonly<{ name: string; className?: string }>) {
  return (
    <span
      aria-hidden
      className={`${className} relative grid shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background`}
    >
      {initials(name)}
      <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-400" />
    </span>
  );
}

function AccessWall({ message }: Readonly<{ message: string }>) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 size-112 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative max-w-md rounded-2xl border border-border bg-surface-lowest p-8 shadow-xl">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ShieldAlert aria-hidden className="size-7" />
        </span>
        <h1 className="font-display mt-5 text-2xl uppercase">Akses ditolak</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

/**
 * Admin shell, matched to the Stitch "Admin Dashboard" screen: sidebar lockup +
 * eyebrow + three grouped nav sections with an active state, and a topbar with
 * the live pill, the date chip and the identity avatar.
 *
 * ponytail: no branch selector and no notification bell, though the design shows
 * both. There is no notifications table, and no admin page reads a branch filter,
 * so either control would be a dead element that looks live. Add them when the
 * pages underneath can honour them.
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getStaffUser().catch(() => null);

  if (!me) {
    // logged in via Supabase but no active staff profile — show a clean wall
    // instead of throwing (a redirect to /login would loop back here).
    return (
      <AccessWall message="Akun ini belum terdaftar sebagai staff aktif. Hubungi owner untuk dibuatkan akses, atau login ulang." />
    );
  }

  if (me.role === "STAFF" && !me.branch_id) {
    // fail-closed tripwire: every STAFF page scopes on branch_id — a null branch
    // would read every outlet. Migration 0034 makes this state impossible for
    // new rows; the wall catches a corrupt or historical row instead of
    // letting it browse unscoped.
    return (
      <AccessWall message="Akun staff ini belum terikat ke cabang mana pun. Hubungi owner untuk mengatur cabang akun." />
    );
  }

  const isStaff = me.role === "STAFF";
  const hidden = isStaff ? [...STAFF_HIDDEN] : [];
  const name = me.full_name?.trim() || me.user_id.slice(0, 8);
  const firstName = name.split(/\s+/)[0] ?? name;
  const role = ROLE_LABEL[me.role] ?? me.role;

  // Payment queue depth for the nav badge. Nothing settles automatically any more, so
  // a cashier needs to know there is work waiting without opening the Bookings page.
  // STAFF count only their branch's queue. Run in parallel so a single navigation
  // does not serialize two independent queries. The branch lookup is also guarded:
  // a failed lookup must degrade to the branch id, never crash the whole shell.
  const [pendingCount, branchRow] = await Promise.all([
    countWaitingPayment(me.branch_id).catch(() => 0),
    isStaff && me.branch_id
      ? createAdminClient()
          .from("branches")
          .select("short_name, name")
          .eq("branch_id", me.branch_id)
          .maybeSingle()
          .then((r) => r, () => ({ data: null }))
      : Promise.resolve({ data: null }),
  ]);

  const branchLabel =
    isStaff && me.branch_id
      ? (branchRow?.data?.short_name ?? branchRow?.data?.name ?? me.branch_id)
      : null;

  const now = new Date();
  const hour = wibHour(now);
  const greeting = greetingFor(hour);
  const shift = shiftFor(hour);
  const identity = `${name} — ${role}${branchLabel ? ` — ${branchLabel}` : ""}`;

  return (
    <div className="relative flex min-h-dvh bg-background">
      <a
        href="#konten"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Lewati ke konten
      </a>

      {/* Ambient glow: murah (CSS only), memberi kedalaman tanpa mengganggu konten. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-72 bg-[radial-gradient(60rem_16rem_at_70%_-4rem,--alpha(var(--color-primary)/12%),transparent)]"
      />

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface-lowest md:flex">
        <Link href="/" className="group flex items-center gap-2.5 px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, sized by CSS */}
          <img
            src="/brand/logo-primary.svg"
            alt=""
            className="h-6 w-auto shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          />
          <span className="min-w-0">
            <span className="font-display block text-base leading-none text-primary">Sukaria</span>
            <span className="block text-[9px] uppercase tracking-[0.16em] whitespace-nowrap text-muted-foreground">
              24 Jam Gaming
            </span>
          </span>
        </Link>

        <p className="mx-5 mt-4 mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface-container px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          <Zap aria-hidden className="size-3 text-primary" />
          Portal Operasional Staff
        </p>

        {/* Nav scrolls on short screens; footer stays pinned. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AdminNav hidden={hidden} pendingCount={pendingCount} />
        </div>

        <div className="space-y-3 border-t border-border p-4">
          <p className="flex items-center justify-between gap-2 rounded-lg border border-border bg-linear-to-r from-primary/10 to-transparent px-3 py-2 text-xs">
            <span className="text-muted-foreground">{shift.label}</span>
            <span className="font-mono font-bold text-primary">{shift.range}</span>
          </p>
          <div className="flex items-center gap-2.5">
            <Avatar name={name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {role}
                {branchLabel ? ` — ${branchLabel}` : ""}
              </span>
            </span>
          </div>
          <LogoutButton compact />
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/80 px-4 py-2.5 backdrop-blur-md md:px-6">
          {/* Hamburger di paling kiri, hanya di layar kecil. Drawer keluar dari kiri. */}
          <AdminNavMobile hidden={hidden} pendingCount={pendingCount} userName={name} userRole={role} />

          <div className="min-w-0">
            <p className="font-display truncate text-sm leading-tight sm:text-base">
              {greeting}, <span className="text-primary">{firstName}</span>
            </p>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Live &middot; Data real-time
            </p>
          </div>

          {/* Grup kanan selalu terdorong ke ujung. */}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {pendingCount > 0 && (
              <Link
                href="/admin/bookings"
                aria-label={`${pendingCount} booking menunggu pembayaran`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-500 transition hover:bg-amber-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                <Wallet aria-hidden className="size-3.5" />
                <span className="font-mono tabular-nums">{pendingCount > 99 ? "99+" : pendingCount}</span>
                <span className="hidden sm:inline">menunggu bayar</span>
              </Link>
            )}

            <p className="hidden items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              <CalendarDays aria-hidden className="size-3.5" />
              {fmtDate(now.toISOString())}
            </p>

            <span title={identity} className="hidden sm:block">
              <Avatar name={name} className="size-8" />
            </span>
          </div>
        </header>

        <main id="konten" className="min-w-0 flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>

      <LiveRefresh />
    </div>
  );
}