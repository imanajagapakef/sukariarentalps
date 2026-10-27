"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking" },
  { href: "/games", label: "Games" },
  { href: "/tempat-main", label: "Tempat Main" },
  { href: "/snacks", label: "Snacks" },
  { href: "/promo", label: "Promo" },
  { href: "/turnamen", label: "Turnamen" },
  { href: "/cabang", label: "Cabang" },
  { href: "/cek-booking", label: "Cek Booking" },
];

/**
 * Site navigation.
 *
 * Most visitors are on a phone, so the two layouts are genuinely different rather than
 * one being a squeezed version of the other:
 *
 * - **Desktop** gets the full row with an underline that grows from the middle on hover
 *   and stays under the current page.
 * - **Phone** gets a hamburger and a panel that slides open. Nine links across a phone
 *   width is unreadable, and a horizontally scrolling bar hides half the destinations
 *   behind a scroll nobody discovers.
 *
 * Three behaviours the panel would otherwise get wrong, all handled here: it closes on
 * navigation (otherwise you tap a link and the menu is still open over the new page), it
 * closes on Escape, and it locks body scroll so the page behind does not move under the
 * user's thumb.
 */
/*
  `useLayoutEffect` on the client — it runs before the browser paints, so the active
  highlight lands on the very first frame instead of flickering in — and `useEffect` on
  the server, where effects never run anyway. The branch sits at module scope, so it
  cannot change a single byte of rendered markup.
*/
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /*
    The active highlight is resolved only *after* mount.

    `usePathname()` during hydration is not guaranteed to equal the pathname the server
    rendered for — Next documents the mismatch for rewrites, and a layout whose RSC
    payload is reused for another route does the same thing quietly. Reading it during
    the first client render then produced a hydration error on every active link: the
    server HTML had no `aria-current` and no dot, the client's first render had both.
    Gating on `hydrated` makes the client's first render byte-identical to the server's;
    the layout effect applies the real highlight before paint, so nothing flickers.
  */
  const [hydrated, setHydrated] = useState(false);
  useIsoLayoutEffect(() => setHydrated(true), []);

  // Navigating away should dismiss the menu. pathname changes on every route change,
  // including one the menu itself triggered, which is exactly when we want it closed.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Locking the body stops the page scrolling behind the panel; without it a touch-drag
    // on the menu edge scrolls the whole site, which feels like the menu is broken.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const isActive = (href: string) =>
    hydrated && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* ---------- desktop ----------

          The breakpoint is `xl`, not `md`. Nine links set in a non-wrapping row measure
          725px, and with the logo and the CTA on either side the row needs roughly 1160px
          to sit without spilling. At `md` (768px) it was already overflowing, so a tablet
          got a nav row wider than the screen. `xl` is the first width where the full row
          genuinely fits; below it the phone layout is the honest one, not a fallback. */}
      <nav aria-label="Utama" className="hidden flex-1 items-center gap-0.5 xl:flex">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                "after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100 motion-reduce:after:transition-none",
                active
                  ? "text-foreground after:scale-x-100"
                  : "text-on-surface-variant hover:text-foreground",
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* ---------- phone: trigger ---------- */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-mobile-nav"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        className="-mr-1 ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted active:bg-muted xl:hidden"
      >
        {/* Rotate rather than swap: the two states share one element so the icon turns
            instead of blinking out and back in. */}
        <span
          className={cn(
            "transition-transform duration-300 motion-reduce:transition-none",
            open ? "rotate-90" : "rotate-0",
          )}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </span>
      </button>

      {/* ---------- phone: panel ----------
          Absolute against the header, so it can span the full width without the nav row
          having to become a column. */}
      <div
        id="site-mobile-nav"
        // Solid, not translucent: at 98% the hero's display type still ghosted through
        // behind the rows and made the menu look like a bug rather than a panel. z-50
        // puts it above the sticky header's own stacking context so nothing in the page
        // can paint over an open menu.
        //
        // Kept mounted and shown with `visibility`, not toggled with the `hidden`
        // attribute: `display: none` cannot animate, so the rows would stagger while the
        // panel itself appeared in a single frame. `invisible` is equivalent for the
        // accessibility tree and the tab order — it is still gone while closed.
        className={cn(
          "absolute inset-x-0 top-full z-50 border-b border-white/10 bg-surface-lowest shadow-2xl shadow-black/60 xl:hidden",
          "transition-[opacity,translate,visibility] duration-[var(--dur-base)] ease-out-quint motion-reduce:transition-none",
          open
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1.5 opacity-0",
        )}
      >
        <nav aria-label="Utama (ponsel)" className="mx-auto flex max-w-6xl flex-col px-4 pb-4 pt-2">
          {NAV.map((n, i) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                // Staggered entry: each row slides in a beat after the one above, which
                // is what makes the panel read as opening rather than appearing.
                style={{ transitionDelay: `${i * 28}ms` }}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-ui motion-reduce:transition-none",
                  open ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-on-surface-variant hover:bg-muted hover:text-foreground",
                )}
              >
                {n.label}
                {active && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
              </Link>
            );
          })}

          <Link
            href="/booking"
            style={{ transitionDelay: `${NAV.length * 28}ms` }}
            className={cn(
              "mt-2 rounded-lg bg-primary px-3 py-3 text-center text-sm font-bold text-primary-foreground transition-ui motion-reduce:transition-none",
              open ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
            )}
          >
            Booking Sekarang
          </Link>
        </nav>
      </div>
    </>
  );
}

/**
 * Whether the page has scrolled past the top few pixels.
 *
 * Lives here rather than in SiteHeader because a file with "use client" cannot export
 * the async server footer, so the header and the footer have to be separate files. The
 * hook is the one piece of state the header needs from the nav's side.
 */
export function useHeaderScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}