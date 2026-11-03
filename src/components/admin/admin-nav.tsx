"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BadgePercent,
  CalendarDays,
  ChevronDown,
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
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";

/*
  Same hydration guard as SiteNav: `usePathname()` at hydration can disagree with the
  pathname the server rendered for (a reused layout payload does it quietly), which
  mismatched every active row — `aria-current` plus the active background. Resolve the
  highlight after mount instead, before paint so it never flickers.
*/
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useIsoLayoutEffect(() => setHydrated(true), []);
  return hydrated;
}

const COLLAPSE_KEY = "admin-nav-collapsed";

/**
 * Per-group collapse state for the sidebar.
 *
 * Deterministic on the server (first group open, the rest folded) so the first
 * client render is byte-identical to the server's — the stored preference then
 * overrides it in a layout effect, before paint, so nothing flickers. Persisted so
 * a cashier who opens "Master Data" keeps it open.
 */
function useCollapsedGroups(groupLabels: string[]) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groupLabels.map((label, i) => [label, i > 0])),
  );

  // A primitive key so the restore effect has a complete, stable dependency —
  // `groupLabels` is a fresh array every render and would re-run it endlessly.
  const groupKeys = groupLabels.join("|");

  useIsoLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Record<string, boolean>;
      setCollapsed((prev) => {
        const next = { ...prev };
        for (const label of groupKeys ? groupKeys.split("|") : []) {
          if (typeof stored[label] === "boolean") next[label] = stored[label];
        }
        return next;
      });
    } catch {
      // storage can be blocked; the default state stands
    }
  }, [groupKeys]);

  const toggle = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/** Wayfinding accent for a nav group — a section cue, never a status signal. */
type GroupTone = "primary" | "info" | "tertiary";

/*
  Literal class strings (never interpolated) so Tailwind's scanner can see them.
  `tertiary` reuses the brand off-white so the third section never borrows the
  amber/red that mean "warning"/"error" everywhere else in the app.
*/
const GROUP_TONE: Record<GroupTone, { dot: string; rule: string; icon: string }> = {
  primary: { dot: "bg-primary", rule: "from-primary/50", icon: "text-primary/75" },
  info: { dot: "bg-info", rule: "from-info/50", icon: "text-info/75" },
  tertiary: { dot: "bg-tertiary", rule: "from-tertiary/40", icon: "text-tertiary/75" },
};

/**
 * Grouped to match the design's three sidebar sections. The route list is the
 * app's real routes — the design also shows "Live Unit Monitor", "Check-in/Out",
 * "Payments" and "Settings", which have no page here, and a nav link that 404s is
 * worse than a missing one.
 */
export const ADMIN_NAV: { label: string; tone: GroupTone; items: AdminNavItem[] }[] = [
  {
    label: "Operasional",
    tone: "primary",
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
    tone: "info",
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
    tone: "tertiary",
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
  const hydrated = useHydrated();
  const { collapsed, toggle } = useCollapsedGroups(groups.map((g) => g.label));

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
      {groups.map((group, gi) => {
        const groupId = `admin-nav-group-${gi}`;
        const hasActive = group.items.some((i) => hydrated && isActive(pathname, i.href));
        // The counter group is always open; the rest fold away so the sidebar is not
        // a wall of fifteen links — but the group holding the current page always
        // opens, or the active row would be hidden inside a collapsed section.
        const isCollapsed = gi === 0 ? false : !hasActive && (collapsed[group.label] ?? true);
        return (
          <div key={group.label} className={gi === 0 ? "" : "mt-5 border-t border-border pt-5"}>
            {/* The eyebrow above already names the first section; repeating it as
                "Operasional" directly underneath read as a stutter. */}
            {gi > 0 && (
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={!isCollapsed}
                aria-controls={groupId}
                className="flex w-full items-center gap-2 rounded-md px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", GROUP_TONE[group.tone].dot)} />
                {group.label}
                <span aria-hidden className={cn("h-px flex-1 bg-linear-to-r to-transparent", GROUP_TONE[group.tone].rule)} />
                <ChevronDown
                  aria-hidden
                  className={cn("size-3.5 transition-transform duration-200", isCollapsed ? "-rotate-90" : "rotate-0")}
                />
              </button>
            )}
            <ul id={groupId} hidden={isCollapsed} className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = hydrated && isActive(pathname, href);
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
                      <Icon
                        aria-hidden
                        className={cn("size-4 shrink-0", !active && GROUP_TONE[group.tone].icon)}
                      />
                      {label}
                      {badgeFor(href)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Mobile hamburger + slide-out panel, mirroring SiteNav on the public site. */
export function AdminNavMobile({
  hidden = [],
  pendingCount = 0,
  userName,
  userRole,
}: {
  hidden?: string[];
  pendingCount?: number;
  userName?: string;
  userRole?: string;
}) {
  const { groups } = useAdminNav(hidden);
  const pathname = usePathname() ?? "/admin";
  const { collapsed, toggle } = useCollapsedGroups(groups.map((g) => g.label));
  const [open, setOpen] = useState(false);
  // Portal target only exists in the browser; gate the drawer behind a mounted flag so
  // the server render and the first client render stay identical.
  const [mounted, setMounted] = useState(false);

  useIsoLayoutEffect(() => {
    setMounted(true);
  }, []);

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

      {/* Left drawer, full height, slides in from the left. Portalled to <body> on
          purpose: the trigger lives inside the sticky header, and that header carries
          `backdrop-blur`. A filtered ancestor becomes the containing block for
          `position: fixed` descendants, so a drawer rendered in place would be sized to
          the header instead of the viewport and sit clipped on a phone. The portal
          escapes that containing block. */}
      {mounted &&
        createPortal(
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
                "absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-border bg-linear-to-b from-surface-lowest to-surface shadow-2xl transition-all duration-300 motion-reduce:transition-none",
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
                {groups.map((group, gi) => {
                  const groupId = `admin-nav-mobile-group-${gi}`;
                  const hasActive = group.items.some((i) => mounted && isActive(i.href));
                  const isCollapsed = gi === 0 ? false : !hasActive && (collapsed[group.label] ?? true);
                  return (
                    <div key={group.label} className={gi === 0 ? "" : "mt-5 border-t border-border pt-5"}>
                      {gi > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(group.label)}
                          aria-expanded={!isCollapsed}
                          aria-controls={groupId}
                          className="flex w-full items-center gap-2 rounded-md px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", GROUP_TONE[group.tone].dot)} />
                          {group.label}
                          <span aria-hidden className={cn("h-px flex-1 bg-linear-to-r to-transparent", GROUP_TONE[group.tone].rule)} />
                          <ChevronDown
                            aria-hidden
                            className={cn("size-3.5 transition-transform duration-200", isCollapsed ? "-rotate-90" : "rotate-0")}
                          />
                        </button>
                      )}
                      <ul id={groupId} hidden={isCollapsed} className="flex flex-col gap-0.5">
                        {group.items.map(({ href, label, icon: Icon }) => {
                          const active = mounted && isActive(href);
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
                                <Icon
                                  aria-hidden
                                  className={cn("size-4 shrink-0", !active && GROUP_TONE[group.tone].icon)}
                                />
                                {label}
                                {badgeFor(href)}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </nav>

              {/* Footer stays put while the list scrolls: the identity and the logout button
                  must be reachable without scrolling, and staff are most likely to need the
                  logout on the phone they are holding. */}
              <div className="shrink-0 space-y-2 border-t border-border p-3">
                {userName && (
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                      <UserRound aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{userName}</span>
                      {userRole && (
                        <span className="block truncate text-xs text-muted-foreground">{userRole}</span>
                      )}
                    </span>
                  </div>
                )}
                <LogoutButton />
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
