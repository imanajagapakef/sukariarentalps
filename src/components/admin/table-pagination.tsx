import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Paging lives in the query string, not in component state.
 *
 * A `?page=2` URL can be shared, reloaded and bookmarked; the filter form keeps working
 * because it simply submits without a `page` input, which lands back on page 1.
 */
function pageHref(basePath: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  // Page 1 is the absence of a param, so the first page has the cleanest URL.
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** `1 … 4 5 [6] 7 8 … 20` — first and last always reachable, the rest around the current page. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const p of pages) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}

/**
 * Footer strip under an admin table: what range you are looking at, and how to walk the
 * rest of it. Renders nothing for an empty result — the page's empty state says more
 * than a pager over zero rows would.
 */
export function TablePagination({
  basePath,
  params,
  page,
  pageCount,
  total,
  from,
  to,
  itemLabel = "booking",
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first row on screen, 0 when there are none. */
  from: number;
  /** 1-based index of the last row on screen. */
  to: number;
  itemLabel?: string;
}) {
  if (total === 0) return null;

  const cell = "flex h-10 min-w-10 items-center justify-center rounded-lg border border-border px-3 text-sm transition-colors";
  const link = `${cell} text-muted-foreground hover:border-primary/60 hover:text-foreground`;
  const disabled = `${cell} border-transparent text-muted-foreground/40`;

  const numbers = pageWindow(page, pageCount).map((p, i) =>
    p === "gap" ? (
      <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
        …
      </span>
    ) : (
      <Link
        key={p}
        href={pageHref(basePath, params, p)}
        aria-current={p === page ? "page" : undefined}
        className={cn(
          p === page ? `${cell} border-primary bg-primary/15 font-medium text-primary` : link,
        )}
        scroll={false}
      >
        {p}
      </Link>
    ),
  );

  return (
    <nav
      aria-label={`Paginasi ${itemLabel}`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground">
        Menampilkan <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> dari{" "}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
        {pageCount > 1 && <span className="text-muted-foreground"> · halaman {page} dari {pageCount}</span>}
      </p>

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <Link href={pageHref(basePath, params, page - 1)} className={link} scroll={false}>
              ← Sebelumnya
            </Link>
          ) : (
            <span className={disabled} aria-disabled>
              ← Sebelumnya
            </span>
          )}

          {numbers}

          {page < pageCount ? (
            <Link href={pageHref(basePath, params, page + 1)} className={link} scroll={false}>
              Berikutnya →
            </Link>
          ) : (
            <span className={disabled} aria-disabled>
              Berikutnya →
            </span>
          )}
        </div>
      )}
    </nav>
  );
}