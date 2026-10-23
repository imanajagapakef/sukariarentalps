import Link from "next/link";
import { getBranches, getGames, getPlatforms, getTopGameRequests, gameGenre } from "@/lib/catalog";
import { Cover } from "@/components/cover";
import { EmptyState } from "@/components/empty-state";
import { GameRequestPanel } from "@/components/game-request-panel";
import { SelectField } from "@/components/ui/select-field";
import { GamesHeroAnimation } from "@/components/games-hero-animation";
import { GENRE_LABEL } from "@/lib/format";

export const revalidate = 300;

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
  const query = (q ?? "").toLowerCase().trim();

  // One row per game in game_features, so [0] is the genre. 0018 filled this for all
  // 58 titles, which is what makes the chips worth showing.
  const genreOf = (g: (typeof games)[number]) => gameGenre(g);
  const genres = [...new Set(games.map(genreOf).filter((v): v is string => !!v))].sort();

  /** Chip links keep the other filters in the query string instead of resetting them. */
  const buildHref = (nextGenre: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (branch) p.set("branch", branch);
    if (platform) p.set("platform", platform);
    if (nextGenre) p.set("genre", nextGenre);
    const s = p.toString();
    return s ? `/games?${s}` : "/games";
  };

  const shown = games.filter((g) => {
    if (query && !g.name.toLowerCase().includes(query)) return false;
    if (branch && !g.game_availability.some((a) => a.branch_id === branch && a.available)) return false;
    if (platform && !g.game_platforms.some((p) => p.platform_id === platform)) return false;
    if (genre && genreOf(g) !== genre) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Games</h1>
          <p className="mt-2 text-muted-foreground">{games.length} game di katalog kami.</p>
        </div>
        <GamesHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari game…"
          aria-label="Cari game"
          className="h-9 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm"
        />
        <SelectField name="branch" defaultValue={branch} aria-label="Filter cabang" className="w-auto">
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.short_name ?? b.name}
            </option>
          ))}
        </SelectField>
        <SelectField name="platform" defaultValue={platform} aria-label="Filter platform" className="w-auto">
          <option value="">Semua platform</option>
          {platforms.map((p) => (
            <option key={p.platform_id} value={p.platform_id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {/* Genre chips. A plain link per genre rather than a select: 17 values is too many
          to scan in a dropdown, and this keeps the whole filter set on one GET so the
          other filters survive. */}
      {genres.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={buildHref(null)}
            className={`rounded-full border px-3 py-1 text-xs ${!genre ? "border-primary bg-primary font-bold text-on-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            Semua genre
          </Link>
          {genres.map((gname) => (
            <Link
              key={gname}
              href={buildHref(gname)}
              className={`rounded-full border px-3 py-1 text-xs ${genre === gname ? "border-primary bg-primary font-bold text-on-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {GENRE_LABEL[gname] ?? gname}
            </Link>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Game tidak ketemu" description="Coba kata kunci atau filter lain." />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((g, i) => (
            <Link
              key={g.game_id}
              href={`/games/${g.slug}`}
              className={`group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary ${i === 0 ? "col-span-2 sm:col-span-2" : ""}`}
            >
              <Cover seed={g.game_id} src={g.image_url} label={g.name} className={`w-full ${i === 0 ? "aspect-[16/10]" : "aspect-[3/4]"}`} />
              <div className="p-3">
                <p className="font-display truncate text-sm uppercase group-hover:text-primary">{g.name}</p>
                <p className="mt-1 flex gap-1 text-xs text-muted-foreground">
                  {g.game_platforms
                    .map((p) => platforms.find((pl) => pl.platform_id === p.platform_id)?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" · ")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <GameRequestPanel initial={requests} />
    </div>
  );
}
