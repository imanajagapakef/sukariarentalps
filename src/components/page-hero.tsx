import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared page hero / header.
 *
 * Every route used to hand-roll its own header: some an eyebrow pill + ambient
 * blobs, some a plain `<h1>`, some a gradient card, one a centered portal. Four
 * dialects for one job meant the app looked like four products. This is the single
 * source of that block, so a change here reaches every page at once.
 *
 * Three axes, deliberately orthogonal rather than one prop per caller:
 *  - `size`   — the type scale (staff vs storefront vs portal display).
 *  - `chrome` — the shell: a bordered card, or bare (the page already owns its frame).
 *  - `align`  — left-aligned with an optional side widget, or a centered portal.
 *
 * Server-safe on purpose — no state, no effect — so it can render inside both the
 * public (ISR) and admin (dynamic) trees without pulling a client boundary in.
 */
type PageHeroTone = "primary" | "amber" | "coral";

const TONE_GLOW: Record<PageHeroTone, string> = {
  primary: "bg-primary/20",
  amber: "bg-amber/20",
  coral: "bg-coral/20",
};

const TONE_BAR: Record<PageHeroTone, string> = {
  primary: "from-primary via-primary/40",
  amber: "from-amber via-amber/40",
  coral: "from-coral via-coral/40",
};

const TITLE_SIZE: Record<NonNullable<PageHeroProps["size"]>, string> = {
  admin: "text-3xl sm:text-4xl",
  public: "text-3xl md:text-5xl",
  display: "text-4xl md:text-6xl",
};

export type PageHeroProps = {
  /** Small pill above the title: an icon plus a short, factual label. */
  eyebrow?: { icon?: LucideIcon; label: React.ReactNode };
  title: React.ReactNode;
  /** Sits inline with the title, left of it (and doubles as the watermark glyph). */
  titleIcon?: LucideIcon;
  description?: React.ReactNode;
  /** Row of CTAs under the description. */
  actions?: React.ReactNode;
  /** Right column on `md`+ when `align="start"`: a hero animation or a widget. */
  aside?: React.ReactNode;
  /** `admin` = compact staff; `public` = storefront; `display` = large portal title. */
  size?: "admin" | "public" | "display";
  /** `card` = bordered panel with ambient art; `bare` = typography only. */
  chrome?: "card" | "bare";
  /** `start` = left-aligned + optional `aside`; `center` = centered portal. */
  align?: "start" | "center";
  tone?: PageHeroTone;
  className?: string;
};

export function PageHero({
  eyebrow,
  title,
  titleIcon: TitleIcon,
  description,
  actions,
  aside,
  size = "public",
  chrome = "card",
  align = "start",
  tone = "primary",
  className,
}: Readonly<PageHeroProps>) {
  const admin = size === "admin";
  const bare = chrome === "bare";
  const center = align === "center";

  return (
    <section
      className={cn(
        "relative",
        !bare && "isolate overflow-hidden rounded-2xl border border-border bg-card shadow-arcade-sm",
        !bare && (admin ? "p-5 sm:p-6" : "p-6 sm:p-8"),
        className,
      )}
    >
      {!bare && (
        <>
          {/* Accent hairline across the top edge. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r to-transparent",
              TONE_BAR[tone],
            )}
          />
          {/* Ambient depth: two soft blobs plus a faint dotted grid, all behind content. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -right-16 -top-24 -z-10 size-64 rounded-full blur-3xl",
              TONE_GLOW[tone],
            )}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 left-1/4 -z-10 size-56 rounded-full bg-amber/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "18px 18px",
            }}
          />
          {/* Oversized watermark glyph, only when a title icon names the page. */}
          {TitleIcon && (
            <TitleIcon
              aria-hidden
              className="pointer-events-none absolute -bottom-6 right-6 -z-10 hidden size-40 -rotate-12 text-primary opacity-[0.07] sm:block"
            />
          )}
        </>
      )}

      <div
        className={cn(
          "flex",
          center
            ? "flex-col items-center gap-4 text-center"
            : "flex-col gap-6 md:flex-row md:items-end md:justify-between",
        )}
      >
        <div className={cn("min-w-0", center ? "max-w-2xl" : "max-w-xl")}>
          {eyebrow && (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              {eyebrow.icon && <eyebrow.icon aria-hidden className="size-3.5" />}
              {eyebrow.label}
            </span>
          )}

          <h1
            className={cn(
              "font-display uppercase leading-tight",
              TITLE_SIZE[size],
              eyebrow ? "mt-3" : "",
              TitleIcon && "flex flex-wrap items-center gap-3",
              center && "justify-center",
            )}
          >
            {TitleIcon && <TitleIcon aria-hidden className="size-8 shrink-0 text-primary" />}
            <span>{title}</span>
          </h1>

          {description && (
            <div
              className={cn(
                "text-sm text-muted-foreground",
                center ? "mx-auto mt-3 max-w-xl" : eyebrow || TitleIcon ? "mt-2" : "mt-3",
              )}
            >
              {description}
            </div>
          )}

          {actions && (
            <div className={cn("mt-5 flex flex-wrap items-center gap-2", center && "justify-center")}>
              {actions}
            </div>
          )}
        </div>

        {aside && !center && <div className="w-full shrink-0 md:w-auto">{aside}</div>}
      </div>
    </section>
  );
}
