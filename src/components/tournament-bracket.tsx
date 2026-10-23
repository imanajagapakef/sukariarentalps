"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import {
  MATCH_STATUS_LABEL,
  bracketRounds,
  isChampion,
  slotLabel,
  winnerFromScore,
  type TournamentMatch,
} from "@/lib/tournament-rules";
import { cn } from "@/lib/utils";

/**
 * Single-elimination bracket, drawn the way a bracket is drawn.
 *
 * Two things make this read as a bracket instead of a list of columns:
 *
 * 1. **The elbows.** Each match connects to the next round with a horizontal line out of
 *    its right edge, a vertical bar where the two feeders meet, and a horizontal line into
 *    the parent card. The geometry falls out of `justify-around`: with equal-height cards
 *    spread over a fixed height H, match i of a round with n matches sits at
 *    ((i - 0.5) / n) * H — and that is exactly the midpoint of its two feeders, because
 *    the parent round has n/2 matches. So the vertical bar is H / (2n) long, tall enough
 *    to touch both feeders and short enough not to reach its neighbours.
 *
 * 2. **The winner is the loud row.** A finished match fills the winning row in the accent
 *    colour and leaves the loser muted, which is what makes the eye travel down the tree
 *    and read the story of the tournament without reading a single name.
 *
 * Player names come from the denormalised copies on the match row (T10), so this never
 * touches registrations and works with the anon client on the public page. The winner is
 * read from the score rather than from the winner id, which cannot disagree with what the
 * resolver stored.
 */

/** Card height. Fixed because the elbow geometry above assumes every card is this tall. */
const CARD_H = 72;
/** Space between round columns; the elbow lives in half of it on each side of the bar. */
const COL_GAP = 56;
/** Vertical breathing room per first-round match. Decides the whole bracket's height. */
const SLOT = 96;

export function TournamentBracket({
  matches,
  className = "",
  /** Ring the matches that are ready to be played. Used on the homepage. */
  spotlightLive = false,
}: {
  matches: readonly TournamentMatch[];
  className?: string;
  spotlightLive?: boolean;
}) {
  const rounds = bracketRounds(matches);

  // The tree is wider than a phone, so it scrolls inside its own container. `moreRight`
  // drives the edge fade, and it has to be measured rather than assumed: on a wide screen
  // the tree fits and a fade would be lying about content that is not there.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);

  const syncOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const slack = el.scrollWidth - el.clientWidth;
    // The second half of the condition hides the fade once the reader reaches the end;
    // a fade over a fully visible last round just looks like a rendering fault.
    setMoreRight(slack > 4 && el.scrollLeft < slack - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncOverflow();
    el.addEventListener("scroll", syncOverflow, { passive: true });
    // The tree changes width when the container resizes and when fonts settle after first
    // paint, so a one-off measurement on mount would be wrong often enough to notice.
    const ro = new ResizeObserver(syncOverflow);
    ro.observe(el);
    const settle = setTimeout(syncOverflow, 400);
    return () => {
      el.removeEventListener("scroll", syncOverflow);
      ro.disconnect();
      clearTimeout(settle);
    };
  }, [syncOverflow, matches.length]);

  if (rounds.length === 0) return null;

  // Height comes from the first round, which has the most matches; every later round
  // spreads the same height over fewer, taller-spaced cards.
  const height = Math.max(232, rounds[0].matches.length * SLOT);

  return (
    // min-w-0 lets this shrink below its content width when it sits in a flex or grid
    // column. Without it the box grows to the tree's width and hands the whole page a
    // sideways scroll on a phone.
    <div className={cn("min-w-0", className)}>
      <div
        ref={scrollerRef}
        className="no-scrollbar overflow-x-auto pb-2"
        role="table"
        aria-label="Bracket"
        style={
          moreRight
            ? {
                // A mask rather than an overlay panel, so it fades the content itself and
                // works over any background colour instead of guessing one per page.
                maskImage:
                  "linear-gradient(to right, #000 calc(100% - 56px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, #000 calc(100% - 56px), transparent 100%)",
              }
            : undefined
        }
      >
        <div className="flex items-start" style={{ minWidth: rounds.length * 250 }}>
          {rounds.map((round, roundIndex) => (
            <div
              key={round.round_no}
              // Columns grow to share the width but stop at 320px: a bracket gets its
              // width from its round count, and a two-round tree stretched across a
              // 1500px screen looks like two enormous cards rather than a bracket.
              //
              // `relative` earns its place past styling. The `sr-only` heading below is
              // `position: absolute`, and an absolutely positioned box is only clipped by
              // an ancestor that is also its containing block. With the column `static`,
              // that containing block sat outside this scroller, so the invisible heading
              // escaped the clip and silently widened the page by ~200px on a phone.
              className="relative flex flex-1 flex-col justify-around"
              style={{
                height,
                maxWidth: 320,
                marginRight: roundIndex < rounds.length - 1 ? COL_GAP : 0,
              }}
            >
              <h3 className="sr-only">{round.label}</h3>
              {round.matches.map((m, i) => {
                const isLast = roundIndex === rounds.length - 1;
                const isFirst = roundIndex === 0;
                // Elbow geometry, see the note above.
                const barH = height / (2 * round.matches.length);

                return (
                  <div
                    key={m.match_id}
                    className="relative"
                    style={{ height: CARD_H }}
                    title={`${round.label} · Match ${i + 1}`}
                  >
                    {/* Out to the next round: the child's half of the elbow. */}
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute bg-primary/45"
                        style={{
                          top: "50%",
                          left: "100%",
                          width: COL_GAP / 2,
                          height: 2,
                          transform: "translateY(-1px)",
                        }}
                      />
                    )}
                    {/* In from the previous round: the bar and the parent's half. */}
                    {!isFirst && (
                      <>
                        <span
                          aria-hidden
                          className="absolute bg-primary/45"
                          style={{
                            top: "50%",
                            left: -COL_GAP / 2,
                            width: COL_GAP / 2,
                            height: 2,
                            transform: "translateY(-1px)",
                          }}
                        />
                        <span
                          aria-hidden
                          className="absolute bg-primary/45"
                          style={{
                            top: "50%",
                            left: -COL_GAP / 2,
                            width: 2,
                            height: barH,
                            transform: "translateY(-50%)",
                          }}
                        />
                      </>
                    )}

                    <MatchCard
                      match={m}
                      index={i}
                      champion={isChampion(m)}
                      highlight={spotlightLive && m.status === "READY"}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Round names sit under the tree rather than above it: above, they push the whole
            bracket down and land next to the first round's cards rather than their column.

            They live INSIDE the scroller. As a sibling outside it they were a second,
            independently wide row — which gave the page a sideways scroll on a phone, and
            left every label sitting still while the tree scrolled away from under it. */}
        <div className="mt-3 flex" style={{ minWidth: rounds.length * 250 }} aria-hidden>
          {rounds.map((round, roundIndex) => (
            <div
              key={round.round_no}
              className="flex-1 text-center"
              style={{ maxWidth: 320, marginRight: roundIndex < rounds.length - 1 ? COL_GAP : 0 }}
            >
              <span className="font-display text-xs uppercase tracking-wide text-muted-foreground">
                {round.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  index,
  champion,
  highlight,
}: {
  match: TournamentMatch;
  index: number;
  champion: boolean;
  highlight: boolean;
}) {
  const winner = winnerFromScore(match);

  return (
    <div
      className={`relative flex h-full flex-col justify-center overflow-hidden rounded-lg border bg-card ${
        highlight
          ? "border-primary shadow-[0_0_0_3px] shadow-primary/25"
          : "border-border"
      }`}
    >
      {/* Match number, outside the card on the left like the reference bracket. */}
      <span
        aria-hidden
        className="absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 rounded border border-border bg-surface-low px-1.5 text-[10px] tabular-nums text-muted-foreground"
      >
        {index + 1}
      </span>

      <PlayerRow
        name={slotLabel(match, "a")}
        seed={match.player_a_seed}
        score={match.score_a}
        won={winner === "a"}
        empty={match.player_a_name === null}
        champion={champion}
      />
      <PlayerRow
        name={slotLabel(match, "b")}
        seed={match.player_b_seed}
        score={match.score_b}
        won={winner === "b"}
        empty={match.player_b_name === null}
        champion={champion}
      />

      {/* Corner, not centre: a vertically centred label lands between the two rows and reads
          as if it belonged to one of them. */}
      {match.status === "WAITING" && (
        <span className="absolute right-2 top-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">
          {MATCH_STATUS_LABEL.WAITING}
        </span>
      )}
    </div>
  );
}

function PlayerRow({
  name,
  seed,
  score,
  won,
  empty,
  champion,
}: {
  name: string;
  seed: number | null;
  score: number | null;
  won: boolean;
  empty: boolean;
  champion: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${
        won
          ? "bg-primary/25 font-semibold text-foreground shadow-[inset_3px_0_0_0] shadow-primary"
          : empty
            ? "text-muted-foreground"
            : "text-on-surface-variant"
      }`}
    >
      {seed !== null && (
        <span className="w-5 shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {seed}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {champion && won && <Trophy aria-hidden className="size-3.5 shrink-0 text-primary" />}
      <span className="shrink-0 font-display text-sm tabular-nums">{score ?? ""}</span>
    </div>
  );
}