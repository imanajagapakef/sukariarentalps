"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BadgePercent,
  CalendarDays,
  Gamepad2,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Receipt,
  Sandwich,
  ScrollText,
  Store,
  Trophy,
  UserCog,
  Users,
  Menu,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Grouped to match the design's three sidebar sections. The route list is the
 * app's real routes — the design also shows "Live Unit Monitor", "Check-in/Out",
 * "Payments" and "Settings", which have no page here, and a nav link that 404s is
 * worse than a missing one.
 */
export const ADMIN_NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Operasional",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutGrid },
      { href: "/admin/bookings", label: "Booking", icon: CalendarDays },
      { href: "/admin/walk-in", label: "Walk-in", icon: Store },
      // Tournament sits with the counter work: registrations are taken, fees collected
      // and players checked in at the door.
      { href: "/admin/turnamen", label: "Turnamen", icon: Trophy },
      { href: "/admin/units", label: "Unit", icon: Monitor },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/admin/snacks", label: "Snack", icon: Sandwich },
      { href: "/admin/games", label: "Game", icon: Gamepad2 },
      { href: "/admin/pricing", label: "Harga", icon: Receipt },
      { href: "/admin/promos", label: "Promo", icon: BadgePercent },
      // Master data: a branch is a location on the public site, not a counter staff
      // work at, so it sits with the other OWNER/ADMIN surfaces.
      { href: "/admin/branches", label: "Cabang", icon: Store },
    ],
  },
  {
    label: "Laporan & Tim",
    items: [
    { href: "/admin/customers", label: "Pelanggan", icon: Users },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
      { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
      { href: "/admin/users", label: "Staff", icon: UserCog },
    ],
  },
];

/** `/admin` must match exactly, or it would light up on every admin page. */
function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Groups with role-hidden entries removed, plus the current path. */
function useAdminNav(hidden: string[]) {
  const pathname = usePathname() ?? "/admin";
  const groups = ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !hidden.includes(i.href)),
  })).filter((g) => g.items.length > 0);
  return { groups, pathname };
}

/** Desktop sidebar list. */
export function AdminNav({ hidden = [], pendingCount = 0 }: { hidden?: string[]; pendingCount?: number }) {
  const { groups, pathname } = useAdminNav(hidden);

  const badgeFor = (href: string) =>
    href === "/admin/bookings" && pendingCount > 0 ? (
      <span
        className="ml-auto rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-background"
        title={`${pendingCount} booking menunggu konfirmasi pembayaran`}
      >
        {pendingCount}
      </span>
    ) : null;

  return (
    // min-h-0: without it a flex child refuses to shrink below its content, the
    // nav pushes the identity block off the bottom of a short viewport.
    <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto px-3">
      {groups.map((group, gi) => (
        <div key={group.label} className={gi === 0 ? "" : "mt-5 border-t border-border pt-5"}>
          {/* The eyebrow above already names the first section; repeating it as
              "Operasional" directly underneath read as a stutter. */}
          {gi > 0 && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-primary font-bold text-on-primary shadow-arcade-sm"
                        : "text-on-surface-variant hover:bg-surface-high hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4 shrink-0" />
                    {label}
                    {badgeFor(href)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Mobile hamburger + slide-out panel, mirroring SiteNav on the public site. */
export function AdminNavMobile({
  hidden = [],
  pendingCount = 0,
}: {
  hidden?: string[];
  pendingCount?: number;
}) {
  const { groups } = useAdminNav(hidden);
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const badgeFor = (href: string) =>
    href === "/admin/bookings" && pendingCount > 0 ? (
      <span
        className="ml-auto rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-background"
        title={`${pendingCount} booking menunggu konfirmasi pembayaran`}
      >
        {pendingCount}
      </span>
    ) : null;

  return (
    <>
      {/* Hamburger trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        className="-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-high active:bg-surface-high md:hidden"
      >
        <span
          className={cn(
            "transition-transform duration-300 motion-reduce:transition-none",
            open ? "rotate-90" : "rotate-0",
          )}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </span>
      </button>

      {/* Left drawer, full height, slides in from the left. Fixed so it can cover the
          viewport regardless of where the trigger sits in the header. */}
      <div
        className={cn("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 transition-opacity duration-300 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Panel */}
        <aside
          id="admin-mobile-nav"
          aria-label="Admin (ponsel)"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-border bg-surface shadow-2xl transition-all duration-300 motion-reduce:transition-none",
            open ? "translate-x-0 opacity-100 visible" : "-translate-x-full opacity-0 invisible",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="font-display text-sm uppercase tracking-wider text-primary">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup menu"
              className="inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-high"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* min-h-0 + overflow-y-auto: the list scrolls on short screens instead of being
              clipped. */}
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {groups.map((group, gi) => (
              <div key={group.label} className={gi === 0 ? "" : "mt-5 border-t border-border pt-5"}>
                {gi > 0 && (
                  <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.label}
                  </p>
                )}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                            active
                              ? "bg-primary font-bold text-on-primary shadow-arcade-sm"
                              : "text-on-surface-variant hover:bg-surface-high hover:text-foreground",
                          )}
                        >
                          <Icon aria-hidden className="size-4 shrink-0" />
                          {label}
                          {badgeFor(href)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}
