import Link from "next/link";
import { notFound } from "next/navigation";
import { getBranches, getGameBySlug, getPlatforms, getSimilarGames } from "@/lib/catalog";
import { GENRE_LABEL } from "@/lib/format";
import { Cover } from "@/components/cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  return { title: game ? `${game.name} — Klub Sukaria` : "Game tidak ditemukan" };
}

function FeatureChip({ on, label }: { on: boolean; label: string }) {
  return (
    <Badge
      variant="secondary"
      className={on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground line-through"}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

// GENRE_LABEL lives in @/lib/format — the /games filter chips need the same map, and
// two copies of a vocabulary is how they drift.

export default async function GameDetailPage({ params }: Props) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) notFound();

  const [branches, platforms, similar] = await Promise.all([
    getBranches(),
    getPlatforms(),
    getSimilarGames(
      game.game_features?.genre ?? null,
      game.game_id,
      game.game_platforms[0]?.platform_id ?? null,
    ),
  ]);

  const platformNames = game.game_platforms
    .map((p) => platforms.find((pl) => pl.platform_id === p.platform_id)?.name)
    .filter((n): n is string => Boolean(n));

  const availableHere = branches.filter((b) =>
    game.game_availability.some((a) => a.branch_id === b.branch_id && a.available),
  );

  const facts = [
    game.developer && { label: "Developer", value: game.developer },
    game.publisher && { label: "Publisher", value: game.publisher },
    game.release_date && { label: "Rilis", value: game.release_date.slice(0, 4) },
    game.age_rating && { label: "Usia", value: game.age_rating },
  ].filter(Boolean) as { label: string; value: string }[];

  // No game in the catalogue has a written description yet, so the "about"
  // section used to fall back to an internal note that shipped to customers.
  // Compose the blurb from fields we actually have instead, and drop the
  // section entirely when even that is empty.
  const f = game.game_features;
  const modes = [
    f?.local_multiplayer && "mabar bareng di satu layar",
    f?.online_multiplayer && "main online",
    f?.co_op && "co-op",
    f?.competitive && "adu kompetitif",
    f?.single_player && "main solo",
  ].filter((m): m is string => Boolean(m));
  const genre = f?.genre ? (GENRE_LABEL[f.genre] ?? f.genre) : null;
  const blurb = [
    game.description ?? game.short_description,
    genre ? `Genre ${genre}.` : null,
    modes.length ? `Bisa ${modes.join(", ")}.` : null,
    platformNames.length ? `Tersedia di ${platformNames.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <Link href="/games" className="text-sm text-muted-foreground hover:text-foreground">
        → Katalog Game
      </Link>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row">
        <Cover seed={game.game_id} src={game.image_url} label={game.name} className="w-full max-w-[240px] shrink-0 self-start rounded-2xl border border-border sm:w-56 sm:aspect-[3/4]" />
        <div className="min-w-0">
          {game.game_features?.genre && (
            <p className="font-display text-xs uppercase tracking-widest text-primary">
              {GENRE_LABEL[game.game_features.genre] ?? game.game_features.genre}
            </p>
          )}
          <h1 className="font-display mt-1 text-3xl uppercase leading-tight md:text-5xl">{game.name}</h1>

          <div className="mt-3 flex flex-wrap gap-2">
            {platformNames.map((p) => (
              <Badge key={p} variant="secondary" className="bg-surface-high text-on-surface">
                {p}
              </Badge>
            ))}
          </div>

          {facts.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6">
            <Button asChild>
              <Link href={`/booking?game=${game.game_id}`}>Booking Sekarang</Link>
            </Button>
          </div>
        </div>
      </div>

      {blurb && (
        <section className="mt-12">
          <h2 className="font-display text-xl uppercase md:text-2xl">Game Ini Tentang Apa?</h2>
          <p className="mt-3 whitespace-pre-line text-on-surface-variant">{blurb}</p>
        </section>
      )}

      {game.game_features && (
        <section className="mt-12">
          <h2 className="font-display text-xl uppercase md:text-2xl">Kemampuan Multiplayer</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <FeatureChip on={game.game_features.local_multiplayer} label="Local Multiplayer (1 Layar)" />
            <FeatureChip on={game.game_features.online_multiplayer} label="Online Multiplayer" />
            <FeatureChip on={game.game_features.co_op} label="Co-op" />
            <FeatureChip on={game.game_features.competitive} label="Competitive" />
            <FeatureChip on={game.game_features.single_player} label="Single Player" />
          </div>
          {(game.game_features.max_local_players || game.game_features.recommended_players) && (
            <p className="mt-3 text-sm text-muted-foreground">
              Pemain:{" "}
              <span className="text-foreground">
                {game.game_features.max_local_players
                  ? `${game.game_features.max_local_players} lokal`
                  : ""}
                {game.game_features.recommended_players
                  ? `${game.game_features.max_local_players ? " · rekomendasi " : "Rekomendasi "}${game.game_features.recommended_players}`
                  : ""}
              </span>
            </p>
          )}
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl uppercase md:text-2xl">Tersedia di Cabang</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {branches.map((b) => {
            const has = availableHere.some((a) => a.branch_id === b.branch_id);
            return (
              <div key={b.branch_id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
                <Link href={`/cabang/${b.branch_id}`} className="font-display text-sm uppercase hover:text-primary">
                  {b.name}
                </Link>
                <span className={`text-sm font-medium ${has ? "text-primary" : "text-muted-foreground"}`}>
                  {has ? "→ Ada" : "Belum ada"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl uppercase md:text-2xl">Game Serupa Buat Sirkel Kamu</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {similar.map((g) => (
              <Link key={g.game_id} href={`/games/${g.slug}`} className="group min-w-0">
                <Cover seed={g.game_id} src={g.image_url} label={g.name} className="aspect-[3/4] w-full rounded-lg border border-border" />
                <p className="font-display mt-1.5 truncate text-xs uppercase group-hover:text-primary">{g.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {availableHere.length === 0 && (
        <div className="mt-12">
          <EmptyState
            title="Belum tersedia di cabang kami"
            description="Request aja lewat voting game — siapa tahu masuk berikutnya."
          />
        </div>
      )}
    </div>
  );
}
