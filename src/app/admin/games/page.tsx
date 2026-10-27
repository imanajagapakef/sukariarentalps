import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import { BadgeCheck, Building2, CalendarDays, Gamepad2, ImageIcon, Lightbulb, ShieldAlert, Sparkles, TriangleAlert, ExternalLink } from "lucide-react";
import { NoPermission } from "@/components/admin/no-permission";
import { getStaffUser } from "@/lib/authz";
import { getGameRequests, getGames } from "@/lib/catalog";
import { GameRequestsAdmin } from "@/components/admin/game-requests-admin";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";
import { StatCards } from "@/components/stat-cards";
import { coverTint } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "image_url", label: "Cover", type: "image" },
  { key: "name", label: "Nama" },
  { key: "developer", label: "Developer" },
  // These two were backfilled in migration 0017 but had no column here, so the data
  // existed in the database and was invisible and uneditable in the only screen that
  // manages it.
  { key: "publisher", label: "Publisher" },
  { key: "release_date", label: "Rilis", type: "date" },
  { key: "age_rating", label: "Age Rating" },
  { key: "short_description", label: "Deskripsi" },
];

type Game = Awaited<ReturnType<typeof getGames>>[number];

/** Kolom yang diukur kelengkapannya. `core` = ikut hitungan "Perlu dilengkapi". */
const FIELDS: { key: string; label: string; core: boolean }[] = [
  { key: "image_url", label: "Cover", core: true },
  { key: "developer", label: "Developer", core: true },
  { key: "publisher", label: "Publisher", core: true },
  { key: "release_date", label: "Tanggal rilis", core: true },
  { key: "age_rating", label: "Age rating", core: false },
  { key: "short_description", label: "Deskripsi", core: false },
];

const raw = (g: Game, key: string): unknown => (g as unknown as Record<string, unknown>)[key];

/**
 * "Terisi" berarti ada isinya, bukan sekadar truthy: sebuah string berisi spasi lolos
 * dari `Boolean(v)` tetapi tampak kosong di tabel, dan baris itu tidak pernah ikut
 * "Perlu dilengkapi".
 */
const filled = (g: Game, key: string) => {
  const v = raw(g, key);
  return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
};

const text = (g: Game, key: string) => {
  const v = raw(g, key);
  return typeof v === "string" ? v.trim() : "";
};

const RATING_BARS = ["bg-primary", "bg-amber", "bg-coral", "bg-primary/50", "bg-muted-foreground/40"];

const pctTone = (pct: number) =>
  pct >= 100 ? "bg-primary" : pct >= 60 ? "bg-amber" : "bg-coral";

export default async function AdminGamesPage() {
  // Master data is OWNER/ADMIN-only at the API layer; this gate is the visible
  // half of that rule, so STAFF hitting the URL gets a refusal instead of rows
  // whose only edit path already 403s.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const games = await getGames();
  const gameRequests = await getGameRequests();
  const total = games.length;

  // Data-quality readouts. These are the two things the table itself cannot tell you
  // at a glance: 58 rows all looking equally "filled" while the cover and the
  // developer/publisher/date columns are silently empty.
  //
  // "Perlu dilengkapi" counts a row for *either* gap, because a missing cover and a
  // missing developer are the same kind of job for whoever fills it in. A cover whose
  // URL points at a deleted object still counts as present here — that needs a bucket
  // check, not a column read.
  const withCover = games.filter((g) => filled(g, "image_url")).length;
  const withMeta = games.filter(
    (g) => filled(g, "developer") && filled(g, "publisher") && filled(g, "release_date"),
  ).length;
  const gapsOf = (g: Game) => FIELDS.filter((f) => f.core && !filled(g, f.key));
  const needsWorkList = games
    .map((g) => ({ g, gaps: gapsOf(g) }))
    .filter((x) => x.gaps.length > 0)
    .sort((a, b) => b.gaps.length - a.gaps.length || String(a.g.name).localeCompare(String(b.g.name)));
  const needsWork = needsWorkList.length;

  /* ---- kelengkapan per kolom + skor keseluruhan ---- */
  const coverage = FIELDS.map((f) => {
    const n = games.filter((g) => filled(g, f.key)).length;
    return { ...f, n, pct: total ? Math.round((n / total) * 100) : 0 };
  });
  const cells = total * FIELDS.length;
  const filledCells = coverage.reduce((s, c) => s + c.n, 0);
  const score = cells ? Math.round((filledCells / cells) * 100) : 0;

  /* ---- sebaran ---- */
  const countBy = (pick: (g: Game) => string) => {
    const m = new Map<string, number>();
    for (const g of games) {
      const k = pick(g);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };

  const ratings = countBy((g) => text(g, "age_rating"));
  const ratingTotal = ratings.reduce((s, [, n]) => s + n, 0);
  const topDevs = countBy((g) => text(g, "developer")).slice(0, 5);

  const years = countBy((g) => {
    const y = text(g, "release_date").slice(0, 4);
    return /^\d{4}$/.test(y) ? y : "";
  })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);
  const maxYear = Math.max(1, ...years.map(([, n]) => n));

  const wall = games.slice(0, 16);

  return (
    <div className="space-y-6">
      {/* ============================ HERO ============================ */}
      <PageHero
        size="admin"
        eyebrow={{ icon: Sparkles, label: `Katalog · ${total} game` }}
        title="Games"
        titleIcon={Gamepad2}
        description="Katalog + info dasar. Ketersediaan per cabang menyusul."
        actions={
          <>
            <a
              href="#editor"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              Buka editor
            </a>
            <a
              href="#request-game"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <Lightbulb aria-hidden className="size-4" /> Request game
            </a>
            {needsWork > 0 && (
              <a
                href="#perlu-dilengkapi"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-4 text-sm font-medium text-amber transition-colors hover:bg-amber/20"
              >
                <TriangleAlert aria-hidden className="size-4" /> {needsWork} perlu dilengkapi
              </a>
            )}
            <Link
              href="/games"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <ExternalLink aria-hidden className="size-4" /> Halaman publik
            </Link>
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kelengkapan katalog</p>
              <p className={cn("font-display text-5xl leading-none tabular-nums", score === 100 ? "text-primary" : "text-foreground")}>
                {score}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={score}
              aria-label={`Kelengkapan katalog ${score} persen`}
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className={cn("h-full rounded-full transition-all", pctTone(score))} style={{ width: `${score}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {filledCells} dari {cells} kolom terisi ({FIELDS.length} kolom × {total} game)
            </p>
          </div>
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0!"
        cards={[
          { label: "Total game", value: total, icon: Gamepad2, hint: "di katalog" },
          {
            label: "Cover ada",
            value: withCover,
            tone: withCover === total ? "primary" : "warning",
            icon: ImageIcon,
            hint: total ? `${Math.round((withCover / total) * 100)}% dari katalog` : undefined,
          },
          {
            label: "Metadata lengkap",
            value: withMeta,
            tone: withMeta === total ? "primary" : "warning",
            icon: BadgeCheck,
            hint: "developer + publisher + rilis",
          },
          {
            label: "Perlu dilengkapi",
            value: needsWork,
            tone: needsWork > 0 ? "warning" : "muted",
            icon: TriangleAlert,
            hint: needsWork > 0 ? "cover atau metadata kosong" : "katalog sudah rapi",
          },
        ]}
      />

      {/* ============================ COVER WALL ====================== */}
      {wall.length > 0 && (
        <section aria-label="Cuplikan cover" className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <ImageIcon aria-hidden className="size-4 text-primary" /> Cover Wall
            </h2>
            <span className="text-xs text-muted-foreground">
              {wall.length} dari {total} game · kotak berwarna = belum ada cover
            </span>
          </div>
          <ul className="-mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2">
            {wall.map((g) => {
              const has = filled(g, "image_url");
              return (
                <li key={String(g.game_id)} className="w-24 shrink-0 sm:w-28">
                  <div className="group relative aspect-3/4 overflow-hidden rounded-xl border border-border bg-muted transition-transform hover:-translate-y-1">
                    {has ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={text(g, "image_url")}
                        alt={`Cover ${g.name}`}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div
                        className="grid size-full place-items-center text-white"
                        style={{ backgroundColor: coverTint(String(g.name)) }}
                      >
                        <span className="font-display text-3xl uppercase">{String(g.name).trim().charAt(0) || "?"}</span>
                        <span className="absolute bottom-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          Belum ada cover
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium">{g.name}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ===================== KELENGKAPAN + PERLU DILENGKAPI ========== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <BadgeCheck aria-hidden className="size-4 text-primary" /> Kelengkapan per Kolom
          </h2>
          <ul className="mt-4 space-y-3">
            {coverage.map((c) => (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium uppercase tracking-wider text-muted-foreground">
                    {c.label}
                    {!c.core && <span className="ml-1.5 normal-case tracking-normal opacity-60">(opsional)</span>}
                  </span>
                  <span className="tabular-nums">
                    <b className="text-foreground">{c.n}</b>
                    <span className="text-muted-foreground">/{total} · {c.pct}%</span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={c.n}
                  aria-label={`${c.label} terisi ${c.n} dari ${total}`}
                  className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div className={cn("h-full rounded-full transition-all", pctTone(c.pct))} style={{ width: `${c.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="perlu-dilengkapi"
          className={cn(
            "scroll-mt-24 rounded-2xl border p-4",
            needsWork > 0 ? "border-amber/40 bg-amber/5" : "border-primary/30 bg-primary/5",
          )}
        >
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <TriangleAlert aria-hidden className={cn("size-4", needsWork > 0 ? "text-amber" : "text-primary")} />
            {needsWork > 0 ? "Perlu Dilengkapi" : "Katalog Rapi"}
          </h2>

          {needsWork === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Semua game punya cover, developer, publisher, dan tanggal rilis. Mantap. ✨
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Diurutkan dari yang paling banyak kosong.</p>
              <ul className="mt-3 space-y-2">
                {needsWorkList.slice(0, 8).map(({ g, gaps }) => (
                  <li
                    key={String(g.game_id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{g.name}</span>
                    <span className="flex flex-wrap gap-1">
                      {gaps.map((f) => (
                        <span
                          key={f.key}
                          className="rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral"
                        >
                          {f.label}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              {needsWork > 8 && (
                <p className="mt-2 text-xs text-muted-foreground">+{needsWork - 8} game lainnya. Lengkapi lewat editor di bawah.</p>
              )}
            </>
          )}
        </section>
      </div>

      {/* ============================ SEBARAN ========================= */}
      {total > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <ShieldAlert aria-hidden className="size-4 text-primary" /> Age Rating
            </h2>
            {ratingTotal === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Belum ada age rating yang terisi.</p>
            ) : (
              <>
                <div role="img" aria-label="Sebaran age rating" className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {ratings.map(([label, n], i) => (
                    <div
                      key={label}
                      className={RATING_BARS[Math.min(i, RATING_BARS.length - 1)]}
                      style={{ width: `${(n / ratingTotal) * 100}%` }}
                      title={`${label}: ${n}`}
                    />
                  ))}
                </div>
                <ul className="mt-3 space-y-1">
                  {ratings.slice(0, 6).map(([label, n], i) => (
                    <li key={label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className={cn("size-2 rounded-full", RATING_BARS[Math.min(i, RATING_BARS.length - 1)])} />
                        {label}
                      </span>
                      <span className="font-medium tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <Building2 aria-hidden className="size-4 text-primary" /> Developer Teratas
            </h2>
            {topDevs.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Belum ada developer yang terisi.</p>
            ) : (
              <ol className="mt-4 space-y-2.5">
                {topDevs.map(([dev, n], i) => (
                  <li key={dev}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium">{dev}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">{n} game</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(n / topDevs[0][1]) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display flex items-center gap-2 text-lg uppercase">
              <CalendarDays aria-hidden className="size-4 text-primary" /> Tahun Rilis
            </h2>
            {years.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Belum ada tanggal rilis yang terisi.</p>
            ) : (
              <>
                <div className="mt-4 flex h-24 items-end gap-1">
                  {years.map(([y, n]) => (
                    <div
                      key={y}
                      title={`${y}: ${n} game`}
                      className="w-full rounded-t-sm bg-primary/60 transition-colors hover:bg-primary"
                      style={{ height: `${Math.max(8, (n / maxYear) * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                  <span>{years[0][0]}</span>
                  <span>{years[years.length - 1][0]}</span>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ============================ EDITOR ========================== */}
      <section id="editor" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              <Gamepad2 aria-hidden className="size-4" />
            </span>
            Editor Katalog
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {total} baris
          </span>
        </div>
        <div className="mt-3">
          <TableEditor
            endpoint="/api/admin/games"
            idKey="game_id"
            columns={COLUMNS}
            rows={games}
            mediaPrefix="games"
          />
        </div>
      </section>

      {/* ========================= REQUEST GAME ====================== */}
      <section id="request-game" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <span className="grid size-7 place-items-center rounded-full bg-amber/15 text-xs font-bold text-amber">
              <Lightbulb aria-hidden className="size-4" />
            </span>
            Request Game
          </h2>
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
            {gameRequests.length} permintaan
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
          Wishlist dari pelanggan di halaman /games. Hanya <strong className="text-foreground">Diminta</strong> dan{" "}
          <strong className="text-foreground">Ditinjau</strong> yang tampil publik — status lain aman tersimpan di sini.
        </p>
        <GameRequestsAdmin requests={gameRequests} />
      </section>
    </div>
  );
}