import Link from "next/link";
import { ArrowRight, Radio, Swords, Trophy } from "lucide-react";
import { getTournamentOverviews, getTournamentMatches } from "@/lib/tournaments";
import { TournamentBracket } from "@/components/tournament-bracket";
import {
  TOURNAMENT_STATUS_LABEL,
  hasStarted,
  latestResults,
  liveMatches,
  resultHeadline,
  type TournamentMatch,
} from "@/lib/tournament-rules";
import { fmtDateTime } from "@/lib/format";
import type { TournamentOverview } from "@/lib/tournaments";

/**
 * The homepage tournament spotlight.
 *
 * This is the section that has to make someone say "anjay ada隔绝nya, kapan ya jadwal
 * match selanjutnya" — so it answers the three questions in the order they are asked,
 * above the fold of this section:
 *
 *   1. **Is it happening?** A live badge, the start time, the branch, the prize.
 *   2. **Who is fighting?** The next READY match, named, at the top.
 *   3. **Who just won?** The last result, as a headline sentence.
 *
 * Then the whole bracket underneath, because the tree is what makes it feel real — an
 * event with a visible winner walking up it looks alive even when nobody is typing a
 * score at that moment.
 *
 * Only one tournament is featured: the liveliest one. A second bracket on a homepage
 * splits attention and reads as filler. Which one is liveliest is decided by
 * `pickSpotlight`, not by "the newest", because the newest tournament is usually the one
 * that has not started yet.
 */

/** Ranked so the tournament worth shouting about comes first. */
function score(t: TournamentOverview, matches: TournamentMatch[]): number {
  let n = 0;
  // Running right now beats everything.
  if (t.status === "ONGOING") n += 100;
  if (t.status === "FULL") n += 55;
  if (t.status === "OPEN") n += 40;
  if (t.status === "DONE") n += 10;
  // A result in the tree is the difference between "an event" and "a poster".
  if (hasStarted(matches)) n += 30;
  if (liveMatches(matches).length > 0) n += 25;
  // A nearly-full tournament is worth more than an empty one.
  if (t.quota > 0) n += Math.round((t.held / t.quota) * 15);
  return n;
}

export async function TournamentSpotlight() {
  const tournaments = await getTournamentOverviews();
  if (tournaments.length === 0) return null;

  // Fetch every bracket, rank, keep the best. A homepage with a dozen tournaments would
  // otherwise need a dozen reads to find the one worth showing.
  const withMatches = await Promise.all(
    tournaments.map(async (t) => {
      const matches = await getTournamentMatches(t.tournament_id);
      return { tournament: t, matches };
    }),
  );

  const best = withMatches
    .map((x) => ({ ...x, rank: score(x.tournament, x.matches) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)[0];

  // Nothing worth featuring: no bracket, no full house, nothing running.
  if (!best || (best.matches.length === 0 && best.tournament.held === 0)) return null;

  const { tournament: t, matches } = best;
  const live = liveMatches(matches);
  const results = latestResults(matches, 1);
  const headline = results[0] ? resultHeadline(results[0]) : null;
  const started = hasStarted(matches);

  return (
    <section className="border-y border-white/8 bg-surface-lowest">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
        {/* ---- headline row ---- */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {started ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase text-primary-foreground">
                  <Radio aria-hidden className="size-3.5 animate-pulse" />
                  Turnamen jalan
                </span>
              ) : (
                <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase text-primary">
                  {TOURNAMENT_STATUS_LABEL[t.status]}
                </span>
              )}
              {t.game_name && (
                <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase text-on-surface-variant">
                  {t.game_name}
                </span>
              )}
            </div>
            <h2 className="mt-3 font-display text-3xl uppercase md:text-5xl">{t.title}</h2>
            {/* Each fact is its own nowrap span, and the dot lives INSIDE the span it
                introduces rather than beside it. As separate flex items the dot was free
                to end a line by itself, which reads as a typo; glued to the fact that
                follows it, the pair wraps together or not at all. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-on-surface-variant">
              <span className="whitespace-nowrap">{fmtDateTime(t.starts_at)}</span>
              <span className="whitespace-nowrap">
                <span aria-hidden className="text-muted-foreground">
                  ·{" "}
                </span>
                {t.branch_short_name ?? t.branch_name}
              </span>
              <span className="whitespace-nowrap">
                <span aria-hidden className="text-muted-foreground">
                  ·{" "}
                </span>
                {t.held}/{t.quota} kursi terisi
              </span>
            </div>
            {t.prize && (
              /* Same reason as above: split on the separator so a prize line breaks
                 between payouts instead of inside one, mid-way through an amount. */
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-primary">
                <Trophy aria-hidden className="size-4 shrink-0" />
                {t.prize
                  .split(/[\n·]+/)
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .map((part, i) => (
                    <span key={i} className="whitespace-nowrap">
                      {part}
                    </span>
                  ))}
              </p>
            )}
          </div>

          {/* The poster, treated as the event's artwork rather than a thumbnail beside a
            title: ringed in the accent colour and given a glow so it reads as the
            brightest object in the section, with the CTA stacked under it so the right
            side of the header is one poster card instead of two unrelated things floating
            at different heights.

            Width is the part that has to differ by device. On desktop the column sits
            beside the title and 320px reads as artwork. On a phone the column takes the
            full row, because at a fixed `w-80` inside a 343px column the poster sat flush
            on the left with 16px of gutter and 39px on the right — an asymmetry that read
            as a broken layout rather than a choice. Full width also lines the poster up
            with the title above it and the CTA below it. */}
          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 md:w-auto">
            {t.poster_url && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.poster_url}
                  alt={`Poster ${t.title}`}
                  /* The glow is dialled back on mobile: at full-bleed width a 70px spread
                     washed across the whole screen and the edges of the text beside it. */
                  className="w-full rounded-xl object-cover shadow-[0_0_30px_-18px] shadow-primary/50 ring-1 ring-primary/40 md:w-80 md:shadow-[0_0_70px_-20px] md:shadow-primary/70 md:ring-2 md:ring-primary/50"
                />
                <span className="absolute -left-2 -top-2 rounded-md bg-primary px-2 py-1 font-display text-[10px] uppercase leading-none text-primary-foreground shadow-lg">
                  Poster
                </span>
              </div>
            )}
            <Link
              href={`/turnamen/${t.slug}`}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Detail &amp; daftar
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>

        {/* ---- the two questions people actually have ---- */}
        {(live.length > 0 || headline) && (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {live.length > 0 && (
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-5">
                <p className="inline-flex items-center gap-2 font-display text-xs uppercase tracking-wide text-primary">
                  <Swords aria-hidden className="size-4" />
                  Match berikutnya
                </p>
                <p className="mt-2 font-display text-xl uppercase">
                  {live[0].player_a_name}
                  <span className="mx-2 text-muted-foreground">vs</span>
                  {live[0].player_b_name}
                </p>
                {live.length > 1 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    +{live.length - 1} match lain menunggu giliran
                  </p>
                )}
              </div>
            )}

            {headline && (
              <div className="rounded-xl border border-white/12 bg-card p-5">
                <p className="font-display text-xs uppercase tracking-wide text-muted-foreground">
                  Hasil terbaru
                </p>
                <p className="mt-2 text-lg">
                  <span className="font-semibold text-primary">{headline.winner}</span>{" "}
                  mengalahkan {headline.loser}
                </p>
                <p className="mt-1 font-display text-2xl tabular-nums">
                  {headline.score}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---- the tree ---- */}
        {matches.length > 0 && (
          <div className="mt-10">
            <TournamentBracket
              matches={matches}
              spotlightLive
              className="[&_[role=table]]:rounded-xl [&_[role=table]]:border [&_[role=table]]:border-white/10 [&_[role=table]]:bg-white/2 [&_[role=table]]:p-5"
            />
          </div>
        )}

        {/* ---- the upsell ---- */}
        {!started && (
          <p className="mt-8 text-center text-on-surface-variant">
            Turnamennya belum mulai. Daftar sekarang, bayar di tempat, bracket-nya keluar
            H-1.
            <Link href={`/turnamen/${t.slug}#daftar`} className="ml-1 text-primary hover:underline">
              Ambil slot
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}