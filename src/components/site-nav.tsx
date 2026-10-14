"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/booking", label: "Booking" },
  { href: "/games", label: "Games" },
  { href: "/tempat-main", label: "Tempat Main" },
  { href: "/snacks", label: "Snacks" },
  { href: "/promo", label: "Promo" },
  { href: "/cabang", label: "Cabang" },
  { href: "/cek-booking", label: "Cek Booking" },
];

/** Customer nav with active-page indication. */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Utama"
      className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto"
    >
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
              active ? "bg-muted text-foreground" : "text-on-surface-variant",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
