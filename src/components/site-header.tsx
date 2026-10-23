"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { SiteNav, useHeaderScrolled } from "@/components/site-nav";
import { cn } from "@/lib/utils";

/**
 * Sticky site header.
 *
 * Its own file because it is a client component — the scroll listener and the mobile
 * menu both need to be — and a file with "use client" cannot also export the async server
 * footer that lives next door in site-chrome.tsx.
 *
 * The header compresses slightly once the page scrolls. Only padding and the divider
 * change, so nothing reflows and nothing jumps; on a phone that is worth about ten pixels
 * of reading area on a screen that does not have many to spare.
 */
export function SiteHeader() {
  const scrolled = useHeaderScrolled();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-surface/85 backdrop-blur-xl transition-all duration-300 motion-reduce:transition-none",
        // The border only appears once there is something behind the header to separate
        // it from; at the very top the page already reads as one surface.
        scrolled ? "border-white/12 py-1.5 shadow-lg shadow-black/20" : "border-transparent py-3",
      )}
    >
      <div className="relative mx-auto flex max-w-6xl items-center gap-2 px-4 md:gap-4 md:px-8">
        <Link
          href="/"
          className="shrink-0 transition-opacity duration-200 hover:opacity-80"
          aria-label="Klub Sukaria — home"
        >
          <Image
            src="/brand/logo-compact.svg"
            alt="Klub Sukaria"
            width={150}
            height={40}
            priority
            unoptimized
            className="h-8 w-auto xl:hidden"
          />
          <Image
            src="/brand/logo-primary.svg"
            alt="Klub Sukaria Gaming House"
            width={210}
            height={42}
            priority
            unoptimized
            className="hidden h-10 w-auto xl:block"
          />
        </Link>

        <SiteNav />

        <Button asChild size="sm" className="hidden shrink-0 xl:inline-flex">
          <Link href="/booking">Booking Sekarang</Link>
        </Button>
      </div>
    </header>
  );
}