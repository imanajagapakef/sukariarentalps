import Link from "next/link";
import { CalendarDays, UserRound } from "lucide-react";
import { getStaffUser } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogoutButton } from "@/components/logout-button";
import { AdminNav, AdminNavMobile } from "@/components/admin/admin-nav";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { countWaitingPayment } from "@/lib/bookings-query";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Admin — Klub Sukaria" };

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", STAFF: "Staff" };

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

  if (me && me.role === "STAFF" && !me.branch_id) {
    // fail-closed tripwire: every STAFF page scopes on branch_id — a null branch
    // would read every outlet. Migration 0034 makes this state impossible for
    // new rows; the wall below catches a corrupt or historical row instead of
    // letting it browse unscoped.
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl uppercase">Akses ditolak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Akun staff ini belum terikat ke cabang mana pun. Hubungi owner untuk mengatur cabang akun.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  if (!me) {
    // logged in via Supabase but no active staff profile — show a clean wall
    // instead of throwing (a redirect to /login would loop back here).
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4 text-center">
        <div>
          <h1 className="font-display text-2xl uppercase">Akses ditolak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Akun ini belum terdaftar sebagai staff aktif. Hubungi owner untuk dibuatkan akses, atau login ulang.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  // Nav mirrors the server-side authz: master data (games/pricing/promos/branches)
  // and user management stay out of STAFF's reach — scoping is enforced per
  // request, this list is only visual. ADMIN may manage STAFF accounts (create
  // + active toggle); role and branch edits there remain OWNER-only server-side.
  const hidden =
    me.role === "STAFF"
      ? [
      "/admin/games",
      "/admin/pricing",
      "/admin/promos",
      "/admin/branches",
      "/admin/users",
      "/admin/audit-log",
    ]
      : [];
  const name = me.full_name ?? me.user_id.slice(0, 8);
  const role = ROLE_LABEL[me.role] ?? me.role;

  // Payment queue depth for the nav badge. Nothing settles automatically any more, so
  // a cashier needs to know there is work waiting without opening the Bookings page.
  // STAFF count only their branch's queue. Run in parallel with the branch lookup so
  // a single navigation does not serialize two independent queries.
  const [pendingCount, branchRow] = await Promise.all([
    countWaitingPayment(me.branch_id).catch(() => 0),
    me.role === "STAFF" && me.branch_id
      ? createAdminClient()
          .from("branches")
          .select("short_name, name")
          .eq("branch_id", me.branch_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let branchLabel: string | null = null;
  if (me.role === "STAFF" && me.branch_id) {
    branchLabel = branchRow?.data ? branchRow.data.short_name ?? branchRow.data.name : me.branch_id;
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-lowest md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 pt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, sized by CSS */}
          <img src="/brand/logo-primary.svg" alt="" className="h-6 w-auto shrink-0" />
          <span className="min-w-0">
            <span className="font-display block text-base leading-none text-primary">Sukaria</span>
            <span className="block text-[9px] uppercase tracking-[0.16em] whitespace-nowrap text-muted-foreground">
              24 Jam Gaming
            </span>
          </span>
        </Link>

        <p className="mx-5 mt-4 mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface-container px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          Portal Operasional Staff
        </p>

        <AdminNav hidden={hidden} pendingCount={pendingCount} />

        <div className="space-y-3 border-t border-border p-4">
          <p className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-container px-3 py-2 text-xs">
            <span className="text-muted-foreground">Shift Malam</span>
            <span className="font-mono font-bold text-primary">20:00 - 08:00 WIB</span>
          </p>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
              <UserRound aria-hidden className="size-4" />
            </span>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:px-6">
          {/* Hamburger di paling kiri, hanya di layar kecil. Drawer keluar dari kiri. */}
          <AdminNavMobile hidden={hidden} pendingCount={pendingCount} />

          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-container px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            Live &middot; Data real-time
          </p>

          {/* Grup kanan selalu terdorong ke ujung. */}
          <div className="ml-auto flex items-center gap-3">
            <p className="hidden items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              <CalendarDays aria-hidden className="size-3.5" />
              {fmtDate(new Date().toISOString())}
            </p>

            <span
              title={`${name} — ${role}${branchLabel ? ` — ${branchLabel}` : ""}`}
              className="hidden size-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary sm:grid"
            >
              <UserRound aria-hidden className="size-4" />
            </span>
          </div>
        </header>

        <main id="konten" className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>

      <LiveRefresh />
    </div>
  );
}
