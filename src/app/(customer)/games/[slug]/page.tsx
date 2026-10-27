import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBranches, getGameBySlug, getPlatforms, getSimilarGames } from "@/lib/catalog";
import { GENRE_LABEL } from "@/lib/format";
import { Cover } from "@/components/cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatCards } from "@/components/stat-cards";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Gamepad2,
  HeartHandshake,
  Monitor,
  Sparkles,
  Store,
  Swords,
  Tag,
  User,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const game = await getGameBySlug(slug).catch(() => null);
  if (!game) return { title: "Game tidak ditemukan" };
  const description =
    game.short_description ?? game.description ?? `Main ${game.name} di Klub Sukaria. Cek cabang yang tersedia dan booking sekarang.`;
  return {
    title: `${game.name} — Klub Sukaria`,
    description,
    // Only absolute URLs: a relative path here would resolve against metadataBase,
    // which this app may not set, and a broken share image is worse than none.
    openGraph: {
      title: game.name,
      description,
      ...(game.image_url?.startsWith("http") ? { images: [game.image_url] } : {}),
    },
  };
}

function FeatureCard({
  on,
  label,
  icon: Icon,
}: Readonly<{ on: boolean; label: string; icon: typeof Users }>) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        on ? "border-primary/40 bg-primary/5" : "border-border bg-card opacity-60",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className={cn("min-w-0 flex-1 text-sm font-medium", !on && "text-muted-foreground")}>{label}</span>
      {on ? (
        <Check aria-label="Didukung" className="size-4 shrink-0 text-primary" />
      ) : (
        <X aria-label="Tidak didukung" className="size-4 shrink-0 text-muted-foreground" />
      )}
    </li>
  );
}

function SectionHead({ eyebrow, title }: Readonly<{ eyebrow: string; title: string }>) {
  return (
    <>
      <p className="font-display text-xs uppercase tracking-widest text-primary">{eyebrow}</p>
      <h2 className="font-display mt-1 text-xl uppercase md:text-2xl">{title}</h2>
    </>
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
  const availableIds = new Set(availableHere.map((b) => b.branch_id));
  const playable = availableHere.length > 0;

  // Exactly one outlet has it: pin the booking to that outlet so the visitor does not
  // have to pick the only possible answer. /booking drops unknown ids, so this is safe.
  const bookingHref =
    availableHere.length === 1
      ? `/booking?game=${game.game_id}&branch=${availableHere[0]!.branch_id}`
      : `/booking?game=${game.game_id}`;

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

  // "Pemain" line, built from parts so the separator logic cannot produce a stray dot
  // or a lowercase "rekomendasi" at the start of a sentence.
  const playerParts = [
    f?.max_local_players ? `${f.max_local_players} pemain lokal` : null,
    f?.recommended_players ? `rekomendasi ${f.recommended_players}` : null,
  ].filter((p): p is string => Boolean(p));
  const playerLine = playerParts.join(" · ");
  const seats = Math.min(f?.max_local_players ?? 0, 8);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Games", href: "/games" },
          { label: game.name },
        ]}
      />

      {/* HERO — poster + identitas di dalam kartu bercahaya, selevel hero halaman admin. */}
      <section className="relative isolate mt-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-arcade-sm sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-primary via-primary/40 to-transparent"
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 -z-10 size-64 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/4 -z-10 size-56 rounded-full bg-amber/10 blur-3xl" />

        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="group/poster w-full max-w-60 shrink-0 self-start sm:w-56">
            <div className="overflow-hidden rounded-2xl border border-border shadow-lg shadow-primary/10 transition duration-500 group-hover/poster:-rotate-1 group-hover/poster:shadow-primary/25 motion-reduce:transition-none">
              <Cover
                seed={game.game_id}
                src={game.image_url}
                label={game.name}
                className="w-full sm:aspect-3/4"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {f?.genre && (
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
                  <Sparkles aria-hidden className="size-3.5" />
                  {GENRE_LABEL[f.genre] ?? f.genre}
                </span>
              )}
              {/* Live availability at a glance, so the answer to "can I play it?" is in
                  the first screen instead of three sections down. */}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1",
                  playable
                    ? "bg-emerald-400/10 text-emerald-500 ring-emerald-400/30"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                <span aria-hidden className="relative flex size-2">
                  {playable && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  )}
                  <span className={cn("relative inline-flex size-2 rounded-full", playable ? "bg-emerald-400" : "bg-muted-foreground/50")} />
                </span>
                {playable ? `Ready di ${availableHere.length} cabang` : "Belum ada di cabang"}
              </span>
            </div>

            <h1 className="font-display mt-3 text-3xl uppercase leading-tight md:text-5xl">{game.name}</h1>

            <div className="mt-3 flex flex-wrap gap-2">
              {platformNames.map((p) => (
                <Badge key={p} variant="secondary" className="bg-surface-high text-on-surface">
                  {p}
                </Badge>
              ))}
            </div>

            {facts.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {facts.map((fact) => (
                  <div key={fact.label} className="border-l-2 border-primary/30 pl-3">
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">{fact.label}</dt>
                    <dd className="font-medium">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {playable ? (
                <Button asChild size="lg" className="group/cta">
                  <Link href={bookingHref}>
                    Booking Sekarang
                    <ArrowRight aria-hidden className="size-4 transition-transform group-hover/cta:translate-x-1 motion-reduce:transition-none" />
                  </Link>
                </Button>
              ) : (
                // Booking a game no outlet offers is a dead end; send them to request it.
                <Button asChild size="lg">
                  <Link href="/games">Request game ini</Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <Link href="/tempat-main">Cek unit kosong</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <StatCards
        cards={[
          {
            label: "Cabang tersedia",
            value: `${availableHere.length}/${branches.length}`,
            tone: playable ? "primary" : "muted",
            icon: Store,
            href: "/tempat-main",
            hint: playable ? "siap dimainkan" : "belum ada yang siap",
          },
          { label: "Platform", value: platformNames.length, icon: Monitor, hint: "jenis konsol" },
          { label: "Genre", value: genre ?? "—", tone: "muted", icon: Tag, hint: "kategori" },
          { label: "Mode main", value: modes.length, icon: Users, hint: modes.length ? modes[0] : "info menyusul" },
        ]}
      />

      {blurb && (
        <section className="mt-10">
          <SectionHead eyebrow="Tentang" title="Game Ini Tentang Apa?" />
          <p className="mt-3 whitespace-pre-line text-on-surface-variant">{blurb}</p>
        </section>
      )}

      {f && (
        <section className="mt-10">
          <SectionHead eyebrow="Fitur" title="Kemampuan Multiplayer" />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            <FeatureCard on={f.local_multiplayer} label="Local Multiplayer (1 Layar)" icon={Gamepad2} />
            <FeatureCard on={f.online_multiplayer} label="Online Multiplayer" icon={Wifi} />
            <FeatureCard on={f.co_op} label="Co-op" icon={HeartHandshake} />
            <FeatureCard on={f.competitive} label="Competitive" icon={Swords} />
            <FeatureCard on={f.single_player} label="Single Player" icon={User} />
          </ul>
          {playerLine && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
              {seats > 0 && (
                <span className="flex items-center gap-0.5 text-primary" aria-hidden>
                  {Array.from({ length: seats }, (_, i) => (
                    <User key={i} className="size-4" />
                  ))}
                </span>
              )}
              <p className="text-sm text-muted-foreground">
                Pemain: <span className="font-medium text-foreground">{playerLine}</span>
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <SectionHead eyebrow="Ketersediaan" title="Tersedia di Cabang" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {branches.map((b) => {
            const has = availableIds.has(b.branch_id);
            return (
              <Link
                key={b.branch_id}
                href={`/cabang/${b.branch_id}`}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-xl border p-4 transition-all hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  has ? "border-primary/40 bg-primary/5 hover:border-primary hover:shadow-lg hover:shadow-primary/10" : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      has ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Store aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="font-display block truncate text-sm uppercase group-hover:text-primary">{b.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{b.operating_hours}</span>
                  </span>
                </span>
                <span className={cn("flex shrink-0 items-center gap-1 text-xs font-bold uppercase", has ? "text-primary" : "text-muted-foreground")}>
                  {has ? "Ada" : "Belum"}
                  <ChevronRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {similar.length > 0 && (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <SectionHead eyebrow="Rekomendasi" title="Game Serupa Buat Sirkel Kamu" />
            </div>
            {f?.genre && (
              <Link
                href={`/games?genre=${encodeURIComponent(f.genre)}`}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Lihat semua {genre}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {similar.map((g) => (
              <Link key={g.game_id} href={`/games/${g.slug}`} className="group min-w-0">
                <div className="overflow-hidden rounded-lg border border-border transition duration-300 group-hover:-translate-y-1 group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/10 motion-reduce:transition-none">
                  <Cover
                    seed={g.game_id}
                    src={g.image_url}
                    label={g.name}
                    className="aspect-3/4 w-full"
                  />
                </div>
                <p className="font-display mt-1.5 truncate text-xs uppercase group-hover:text-primary">{g.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!playable && (
        <div className="mt-10">
          <EmptyState
            title="Belum tersedia di cabang kami"
            description="Request aja lewat voting game — siapa tahu masuk berikutnya."
          />
          <p className="mt-4 text-center text-sm">
            <Link href="/games" className="font-medium text-primary underline-offset-2 hover:underline">
              Buka voting request game
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}