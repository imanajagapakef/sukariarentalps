import { getBranches, getGames, getPlatforms } from "@/lib/catalog";
import { Cover } from "@/components/cover";
import { EmptyState } from "@/components/empty-state";

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; platform?: string; q?: string }>;
}) {
  const { branch, platform, q } = await searchParams;
  const [games, branches, platforms] = await Promise.all([getGames(), getBranches(), getPlatforms()]);
  const query = (q ?? "").toLowerCase().trim();

  const shown = games.filter((g) => {
    if (query && !g.name.toLowerCase().includes(query)) return false;
    if (branch && !g.game_availability.some((a) => a.branch_id === branch && a.available)) return false;
    if (platform && !g.game_platforms.some((p) => p.platform_id === platform)) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Games</h1>
      <p className="mt-2 text-muted-foreground">{games.length} game di katalog kami.</p>

      <form className="mt-6 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari game…"
          aria-label="Cari game"
          className="h-9 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm"
        />
        <select name="branch" defaultValue={branch} aria-label="Filter cabang" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
          <option value="">Semua cabang</option>
          {branches.map((b) => (
            <option key={b.branch_id} value={b.branch_id}>
              {b.short_name ?? b.name}
            </option>
          ))}
        </select>
        <select name="platform" defaultValue={platform} aria-label="Filter platform" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
          <option value="">Semua platform</option>
          {platforms.map((p) => (
            <option key={p.platform_id} value={p.platform_id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Game tidak ketemu" description="Coba kata kunci atau filter lain." />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((g) => (
            <div key={g.game_id} className="overflow-hidden rounded-xl border border-border bg-card">
              <Cover seed={g.game_id} label={g.name} className="aspect-[3/4] w-full" />
              <div className="p-3">
                <p className="font-display truncate text-sm uppercase">{g.name}</p>
                <p className="mt-1 flex gap-1 text-xs text-muted-foreground">
                  {g.game_platforms
                    .map((p) => platforms.find((pl) => pl.platform_id === p.platform_id)?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
