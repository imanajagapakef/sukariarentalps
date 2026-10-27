import { PageHero } from "@/components/page-hero";
import { Gamepad2, Monitor, Search, Sparkles, Store, Tag, X } from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import Link from "next/link";
import { getBranches, getGames, getPlatforms, getTopGameRequests, gameGenre } from "@/lib/catalog";
import { Cover } from "@/components/cover";
import { EmptyState } from "@/components/empty-state";
import { GameRequestPanel } from "@/components/game-request-panel";
import { SelectField } from "@/components/ui/select-field";
import { GamesHeroAnimation } from "@/components/games-hero-animation";
import { GENRE_LABEL } from "@/lib/format";

export const revalidate = 300;

type FilterKey = "q" | "branch" | "platform" | "genre";

const CHIP_BASE = "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors";
const CHIP_ON = "border-primary bg-primary font-bold text-on-primary";
const CHIP_OFF = "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground";

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; platform?: string; genre?: string; q?: string }>;
}) {
  const { branch, platform, genre, q } = await searchParams;
  const [games, branches, platforms, requests] = await Promise.all([
    getGames(),
    getBranches(),
    getPlatforms(),
    getTopGameRequests(),
  ]);

  const qTrim = (q ?? "").trim();
  const query = qTrim.toLowerCase();

  // One row per game in game_features, so [0] is the genre. 0018 filled this for all
  // 58 titles, which is what makes the chips worth showing.
  const genreOf = (g: (typeof games)[number]) => gameGenre(g);
  const genres = [...new Set(games.map(genreOf).filter((v): v is string => !!v))].sort();

  // A stale or hand-edited ?branch= / ?platform= / ?genre= used to filter everything
  // away and show "Game tidak ketemu" with no hint why. Unknown values are dropped now,
  // so the page falls back to the unfiltered catalog instead of a silent dead end.
  const branchId = branch && branches.some((b) => b.branch_id === branch) ? branch : undefined;
  const platformId = platform && platforms.some((p) => p.platform_id === platform) ? platform : undefined;
  const genreId = genre && genres.includes(genre) ? genre : undefined;

  /** Links keep the other filters in the query string instead of resetting them. Pass
   *  `null` to clear one key. */
  const href = (override: Partial<Record<FilterKey, string | null>> = {}) => {
    const v: Record<FilterKey, string | null> = {
      q: qTrim || null,
      branch: branchId ?? null,
      platform: platformId ?? null,
      genre: genreId ?? null,
      ...override,
    };
    const p = new URLSearchParams();
    (Object.keys(v) as FilterKey[]).forEach((k) => {
      if (v[k]) p.set(k, v[k] as string);
    });
    const s = p.toString();
    return s ? `/games?${s}` : "/games";
  };

  const matchesBase = (g: (typeof games)[number]) => {
    if (query && !g.name.toLowerCase().includes(query)) return false;
    if (branchId && !g.game_availability.some((a) => a.branch_id === branchId && a.available)) return false;
    if (platformId && !g.game_platforms.some((p) => p.platform_id === platformId)) return false;
    return true;
  };

  // Everything except the genre filter: this is the pool the chips count against, so a
  // chip's number is what you would actually get by clicking it.
  const pool = games.filter(matchesBase);
  const genreCount = new Map<string, number>();
  for (const g of pool) {
    const gn = genreOf(g);
    if (gn) genreCount.set(gn, (genreCount.get(gn) ?? 0) + 1);
  }
  const shown = genreId ? pool.filter((g) => genreOf(g) === genreId) : pool;

  const branchName = (id: string) => {
    const b = branches.find((x) => x.branch_id === id);
    return b ? (b.short_name ?? b.name) : id;
  };
  const platformName = (id: string) => platforms.find((p) => p.platform_id === id)?.name ?? id;

  const active: { key: string; label: string; to: string }[] = [];
  if (qTrim) active.push({ key: "q", label: `“${qTrim}”`, to: href({ q: null }) });
  if (branchId) active.push({ key: "branch", label: branchName(branchId), to: href({ branch: null }) });
  if (platformId) active.push({ key: "platform", label: platformName(platformId), to: href({ platform: null }) });
  if (genreId) active.push({ key: "genre", label: GENRE_LABEL[genreId] ?? genreId, to: href({ genre: null }) });
  const filtered = active.length > 0;

  // The hero card only makes sense when there is a crowd to stand out from.
  const featureFirst = shown.length >= 3;

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 md:px-8">
      {/* Ambient glow behind the hero: CSS only, no layout cost. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-80 bg-[radial-gradient(50rem_16rem_at_50%_0%,theme(colors.primary/15%),transparent)]"
      />

      <PageHero
        className="mt-6"
        eyebrow={{ icon: Sparkles, label: `${games.length} game · ${platforms.length} platform` }}
        title="Games"
        titleIcon={Gamepad2}
        description="Katalog lengkap yang bisa dimainkan. Filter per cabang, platform, atau genre."
        aside={<GamesHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />}
      />

      <StatCards
        cards={[
          { label: "Total game", value: games.length, icon: Gamepad2, hint: "di katalog" },
          {
            label: "Tampil",
            value: shown.length,
            tone: "primary",
            icon: Sparkles,
            hint: filtered ? "sesuai filter" : "semua",
          },
          { label: "Genre", value: genres.length, icon: Tag, hint: "kategori" },
          { label: "Platform", value: platforms.length, icon: Monitor, hint: "jenis konsol" },
        ]}
      />

      <form
        className="mt-6 flex flex-wrap items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
        method="get"
        role="search"
      >
        <div className="relative w-full sm:max-w-xs sm:flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={qTrim}
            placeholder="Cari game…"
            aria-label="Cari game"
            className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <SelectField name="branch" defaultValue={branchId} aria-label="Filter cabang" className="w-auto">
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.short_name ?? b.name}
            </option>
          ))}
        </SelectField>
        <SelectField name="platform" defaultValue={platformId} aria-label="Filter platform" className="w-auto">
          <option value="">Semua platform</option>
          {platforms.map((p) => (
            <option key={p.platform_id} value={p.platform_id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        {/* Submitting the form used to drop the active genre chip; carry it along. */}
        {genreId && <input type="hidden" name="genre" value={genreId} />}
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:brightness-110 active:scale-95"
        >
          Filter
        </button>
      </form>

      {/* Genre chips. A plain link per genre rather than a select: 17 values is too many
          to scan in a dropdown, and this keeps the whole filter set on one GET so the
          other filters survive. One scrolling row on phones, wrapping from md up. */}
      {genres.length > 1 && (
        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          <Link
            href={href({ genre: null })}
            aria-current={!genreId ? "true" : undefined}
            className={`${CHIP_BASE} ${!genreId ? CHIP_ON : CHIP_OFF}`}
          >
            Semua genre <span className="font-mono opacity-70">{pool.length}</span>
          </Link>
          {genres.map((gname) => {
            const count = genreCount.get(gname) ?? 0;
            const on = genreId === gname;
            return (
              <Link
                key={gname}
                href={href({ genre: gname })}
                aria-current={on ? "true" : undefined}
                className={`${CHIP_BASE} ${on ? CHIP_ON : count === 0 ? `${CHIP_OFF} opacity-40` : CHIP_OFF}`}
              >
                {GENRE_LABEL[gname] ?? gname} <span className="font-mono opacity-70">{count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Active filters as removable chips, plus a live result count. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span>
          Menampilkan <strong className="font-mono text-foreground">{shown.length}</strong> dari {games.length} game
        </span>
        {active.map((f) => (
          <Link
            key={f.key}
            href={f.to}
            aria-label={`Hapus filter ${f.label}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary ring-1 ring-primary/25 transition hover:bg-primary/20"
          >
            {f.label}
            <X aria-hidden className="size-3" />
          </Link>
        ))}
        {filtered && (
          <Link href="/games" className="underline-offset-2 hover:text-foreground hover:underline">
            Reset semua
          </Link>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Game tidak ketemu" description="Coba kata kunci atau filter lain." />
          {filtered && (
            <p className="mt-4 text-center text-sm">
              <Link href="/games" className="font-medium text-primary underline-offset-2 hover:underline">
                Hapus semua filter
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((g, i) => {
            const feature = featureFirst && i === 0;
            const gn = genreOf(g);
            const outlets = g.game_availability.filter((a) => a.available).length;
            const platformNames = g.game_platforms
              .map((p) => platforms.find((pl) => pl.platform_id === p.platform_id)?.name)
              .filter((n): n is string => !!n)
              .slice(0, 3);
            return (
              <Link
                key={g.game_id}
                href={`/games/${g.slug}`}
                className={`group overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-xl hover:shadow-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${feature ? "col-span-2 sm:col-span-2" : ""}`}
              >
                <div className="relative overflow-hidden">
                  <div className="transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none">
                    <Cover
                      seed={g.game_id}
                      src={g.image_url}
                      label={g.name}
                      className={`w-full ${feature ? "aspect-16/10" : "aspect-3/4"}`}
                    />
                  </div>
                  {/* Legibility scrim for the badges, only where they sit. */}
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
                  {gn && (
                    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                      {GENRE_LABEL[gn] ?? gn}
                    </span>
                  )}
                  {feature && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">
                      <Sparkles aria-hidden className="size-3" />
                      Pilihan
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className={`font-display truncate uppercase group-hover:text-primary ${feature ? "text-base" : "text-sm"}`}>
                    {g.name}
                  </p>
                  {platformNames.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {platformNames.map((n) => (
                        <span key={n} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {n}
                        </span>
                      ))}
                    </p>
                  )}
                  {outlets > 0 && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Store aria-hidden className="size-3 text-primary" />
                      {outlets} cabang
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <GameRequestPanel initial={requests} />
    </div>
  );
}