"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Gamepad2,
  LayoutGrid,
  MessageSquare,
  Monitor,
  Receipt,
  Sandwich,
  ScrollText,
  Store,
  UserCog,
  Users,
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
      { href: "/admin/units", label: "Unit", icon: Monitor },
    ],
  },
  {
    label: "Master Data",
    items: [
      { href: "/admin/snacks", label: "Snack", icon: Sandwich },
      { href: "/admin/games", label: "Game", icon: Gamepad2 },
      { href: "/admin/pricing", label: "Harga", icon: Receipt },
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

/** Narrow-viewport pill row. */
export function AdminNavMobile({
  hidden = [],
  pendingCount = 0,
}: {
  hidden?: string[];
  pendingCount?: number;
}) {
  const { groups, pathname } = useAdminNav(hidden);

  return (
    <nav aria-label="Admin" className="flex items-center gap-2 overflow-x-auto">
      {groups.flatMap((g) => g.items).map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs",
              active
                ? "border-primary bg-primary font-bold text-on-primary"
                : "border-border text-muted-foreground",
            )}
>
              {label}
              {href === "/admin/bookings" && pendingCount > 0 && (
                <span className="ml-1.5 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-background">
                  {pendingCount}
                </span>
              )}
            </Link>
        );
      })}
    </nav>
  );
}
