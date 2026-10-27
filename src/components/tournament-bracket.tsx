"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronsRight, Crown, Trophy } from "lucide-react";
import {
  MATCH_STATUS_LABEL,
  bracketRounds,
  isChampion,
  resultHeadline,
  slotLabel,
  winnerFromScore,
  type TournamentMatch,
} from "@/lib/tournament-rules";
import { cn } from "@/lib/utils";

/**
 * Single-elimination bracket, drawn the way a bracket is drawn.
 *
 * 1. **The elbows.** Each match connects to the next round with a horizontal line out of
 *    its right edge, a vertical bar where the two feeders meet, and a horizontal line into
 *    the parent card. With equal-height cards spread over a fixed height H by
 *    `justify-around`, match i of a round with n matches sits at ((i - 0.5) / n) * H, which
 *    is exactly the midpoint of its two feeders. So the vertical bar is H / (2n) long.
 *    The bar is drawn as two halves (one per feeder) so each half can light up on its own.
 *
 * 2. **The winner path glows.** A connector lights up the moment the match feeding it has a
 *    winner, and the line leading into a match that is ready to be played pulses with a
 *    travelling highlight. The eye follows the glowing trail up the tree and reads the
 *    story of the tournament without reading a single name.
 *
 * 3. **The winner is the loud row.** A finished match fills the winning row in the accent
 *    colour (with a slow shine) and dims the loser. The champion's card gets a gold halo
 *    and a crown.
 *
 * Player names come from the denormalised copies on the match row (T10), so this never
 * touches registrations and works with the anon client on the public page. The winner is
 * read from the score rather than from the winner id, which cannot disagree with what the
 * resolver stored.
 *
 * All motion is CSS-only and switched off under `prefers-reduced-motion`.
 */

/** Card height. Fixed because the elbow geometry above assumes every card is this tall. */
const CARD_H = 72;
/** Space between round columns; the elbow lives in half of it on each side of the bar. */
const COL_GAP = 56;
/** Vertical breathing room per first-round match. Decides the whole bracket's height. */
const SLOT = 96;

const GOLD = "#ffb84d";

const CSS = `
.tb-in{animation:tb-in .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
.tb-win{position:relative;overflow:hidden;contain:paint}
.tb-win::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 35%,rgba(255,255,255,.22) 50%,transparent 65%);transform:translateX(-130%);animation:tb-shine 6s ease-in-out infinite;animation-delay:calc(var(--d,0ms) + 1200ms)}
.tb-lit{animation:tb-lit 2.4s ease-in-out infinite}
.tb-flow{background-image:linear-gradient(90deg,transparent,currentColor,transparent);background-size:200% 100%;animation:tb-flow 1.1s linear infinite}
.tb-gold{animation:tb-gold 2.2s ease-in-out infinite}
.tb-crown{animation:tb-crown 2s ease-in-out infinite}
.tb-lift{animation:tb-lift 2.6s ease-in-out infinite}
.tb-rays{animation:tb-spin 18s linear infinite}
.tb-conf{animation:tb-conf linear infinite}
.tb-twinkle{animation:tb-twinkle 1.6s ease-in-out infinite}
.tb-nudge{animation:tb-nudge 1s ease-in-out infinite}
.tb-sweep{animation:tb-shine 4.5s ease-in-out infinite}
@keyframes tb-in{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
@keyframes tb-shine{0%,60%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
@keyframes tb-lit{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes tb-flow{to{background-position:-200% 0}}
@keyframes tb-gold{0%,100%{box-shadow:0 0 0 2px rgba(255,184,77,.5),0 0 14px rgba(255,184,77,.25)}50%{box-shadow:0 0 0 2px rgba(255,184,77,.95),0 0 30px rgba(255,184,77,.55)}}
@keyframes tb-crown{0%,100%{transform:translateX(-50%) translateY(0) rotate(-6deg)}50%{transform:translateX(-50%) translateY(-4px) rotate(6deg)}}
@keyframes tb-lift{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes tb-spin{to{transform:rotate(360deg)}}
@keyframes tb-conf{0%{opacity:0;transform:translateY(-14px) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(130px) rotate(540deg)}}
@keyframes tb-twinkle{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1.2)}}
@keyframes tb-nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
@media (prefers-reduced-motion:reduce){
  .tb-in,.tb-win::after,.tb-lit,.tb-flow,.tb-gold,.tb-crown,.tb-lift,.tb-rays,.tb-conf,.tb-twinkle,.tb-nudge,.tb-sweep{animation:none!important}
  .tb-conf{display:none}
  .tb-crown{transform:translateX(-50%)}
}
`;

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

  // The final is the match nobody feeds into. Two headline states read off it: a champion
  // once it is decided, and "final is set" once both finalists are known but the match has
  // not been played. Either way the bracket wears a banner above it.
  const finalMatch = matches.find((m) => m.next_match_id === null) ?? null;
  const champion =
    finalMatch?.status === "FINISHED" ? (resultHeadline(finalMatch)?.winner ?? null) : null;
  const finalReady =
    !champion &&
    finalMatch !== null &&
    finalMatch.player_a_name !== null &&
    finalMatch.player_b_name !== null;

  // The tree is wider than a phone, so it scrolls inside its own container. `moreRight`
  // drives the edge fade and the "geser" hint, and it has to be measured rather than
  // assumed: on a wide screen the tree fits and a fade would be lying.
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
      <style>{CSS}</style>

      {champion ? (
        <div className="mb-5">
          <ChampionBanner name={champion} />
        </div>
      ) : finalReady ? (
        <div className="mb-4 flex justify-center">
          <FinalTrophy a={finalMatch.player_a_name ?? ""} b={finalMatch.player_b_name ?? ""} />
        </div>
      ) : null}

      <div className="relative">
        <div
          ref={scrollerRef}
          className="no-scrollbar overflow-x-auto overscroll-x-contain pb-2 pt-4"
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
            {rounds.map((round, roundIndex) => {
              const isLast = roundIndex === rounds.length - 1;
              const isFirst = roundIndex === 0;
              const prev = isFirst ? undefined : rounds[roundIndex - 1].matches;

              return (
                <div
                  key={round.round_no}
                  // Columns grow to share the width but stop at 320px: a bracket gets its
                  // width from its round count, and a two-round tree stretched across a
                  // 1500px screen looks like two enormous cards rather than a bracket.
                  //
                  // `relative` earns its place past styling. The `sr-only` heading below is
                  // `position: absolute`, and an absolutely positioned box is only clipped
                  // by an ancestor that is also its containing block. With the column
                  // `static`, that containing block sat outside this scroller, so the
                  // invisible heading escaped the clip and silently widened the page by
                  // ~200px on a phone.
                  className="relative flex flex-1 flex-col justify-around"
                  style={{
                    height,
                    maxWidth: 320,
                    marginRight: !isLast ? COL_GAP : 0,
                  }}
                >
                  <h3 className="sr-only">{round.label}</h3>
                  {round.matches.map((m, i) => {
                    // Elbow geometry, see the note above.
                    const barH = height / (2 * round.matches.length);
                    const half = barH / 2;

                    // Which earlier matches feed this one: the tree is binary, so
                    // match i is fed by 2i and 2i + 1 of the previous round.
                    const feederA = prev?.[2 * i];
                    const feederB = prev?.[2 * i + 1];
                    const litA = feederA ? Boolean(winnerFromScore(feederA)) : false;
                    const litB = feederB ? Boolean(winnerFromScore(feederB)) : false;
                    const ready = m.status === "READY";
                    const own = Boolean(winnerFromScore(m));

                    return (
                      <div
                        key={m.match_id}
                        className="tb-in relative"
                        style={
                          {
                            height: CARD_H,
                            "--d": `${roundIndex * 140 + i * 70}ms`,
                          } as CSSProperties
                        }
                        title={`${round.label} · Match ${i + 1}`}
                      >
                        {/* Match index, pinned just above the card's top-left corner.
                            It hangs on this wrapper rather than inside `MatchCard`
                            because the card clips its own overflow (it has to: the
                            winner shine and the rounded corners depend on it) and
                            would swallow a badge that pokes past its edge.

                            Above the top edge, not out to the left. The gap left of
                            every later round is filled by the elbow connector, and
                            left of the FIRST round sits outside the scroller's
                            content box — a badge there is reachable only by widening
                            the page, which is the sideways drag we are keeping off a
                            phone. Here it grows within the column, so it can never
                            hand the page a horizontal scroll. */}
                        <span
                          aria-hidden
                          className="absolute -top-3.5 left-1 rounded border border-border bg-surface-low px-1.5 text-[10px] leading-tight tabular-nums text-muted-foreground"
                        >
                          {i + 1}
                        </span>

                        {/* Out to the next round: the child's half of the elbow. */}
                        {!isLast && (
                          <Seg
                            lit={own}
                            style={{
                              top: "50%",
                              left: "100%",
                              width: COL_GAP / 2,
                              height: 2,
                              transform: "translateY(-1px)",
                            }}
                          />
                        )}
                        {/* In from the previous round: two bar halves and the parent's half. */}
                        {!isFirst && (
                          <>
                            <Seg
                              lit={litA || litB}
                              flow={ready}
                              style={{
                                top: "50%",
                                left: -COL_GAP / 2,
                                width: COL_GAP / 2,
                                height: 2,
                                transform: "translateY(-1px)",
                              }}
                            />
                            <Seg
                              lit={litA}
                              style={{
                                top: `calc(50% - ${half}px)`,
                                left: -COL_GAP / 2,
                                width: 2,
                                height: half + 1,
                              }}
                            />
                            <Seg
                              lit={litB}
                              style={{
                                top: "calc(50% - 1px)",
                                left: -COL_GAP / 2,
                                width: 2,
                                height: half + 1,
                              }}
                            />
                          </>
                        )}

                        {/* Ping ring sits outside the card, which clips its own overflow. */}
                        {spotlightLive && ready && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 animate-ping rounded-lg ring-2 ring-primary/50 motion-reduce:animate-none"
                          />
                        )}

                        {isChampion(m) && (
                          <Crown
                            aria-hidden
                            className="tb-crown absolute -top-5 left-1/2 z-10 size-6"
                            style={{ color: GOLD, filter: `drop-shadow(0 0 6px ${GOLD})` }}
                          />
                        )}

                        <MatchCard
                          match={m}
                          champion={isChampion(m)}
                          highlight={spotlightLive && ready}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Round names sit under the tree rather than above it: above, they push the whole
              bracket down and land next to the first round's cards rather than their column.

              They live INSIDE the scroller. As a sibling outside it they were a second,
              independently wide row, which gave the page a sideways scroll on a phone and
              left every label sitting still while the tree scrolled away from under it. */}
          <div className="mt-3 flex" style={{ minWidth: rounds.length * 250 }} aria-hidden>
            {rounds.map((round, roundIndex) => {
              const done = round.matches.filter((m) => m.status === "FINISHED").length;
              const total = round.matches.length;
              const complete = done === total;
              const isFinal = roundIndex === rounds.length - 1;

              return (
                <div
                  key={round.round_no}
                  className="flex flex-1 flex-col items-center gap-1.5"
                  style={{
                    maxWidth: 320,
                    marginRight: roundIndex < rounds.length - 1 ? COL_GAP : 0,
                  }}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-xs uppercase tracking-wide",
                      complete
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border bg-surface-low text-muted-foreground",
                    )}
                  >
                    {isFinal && <Trophy className="size-3" />}
                    {round.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-low">
                      <span
                        className="block h-full rounded-full bg-primary transition-[width] duration-700"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {done}/{total}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* "There is more this way": only drawn when the tree actually overflows. */}
        {moreRight && (
          <span
            aria-hidden
            className="tb-nudge pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-primary p-1.5 text-background shadow-lg shadow-primary/40"
          >
            <ChevronsRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

/** One connector segment. Lit = a winner has come through it; flow = a match is waiting to be played. */
function Seg({
  lit,
  flow = false,
  style,
}: {
  lit: boolean;
  flow?: boolean;
  style: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute",
        flow
          ? "tb-flow text-primary"
          : lit
            ? "tb-lit bg-primary shadow-[0_0_8px] shadow-primary/70"
            : "bg-primary/25",
      )}
      style={style}
    />
  );
}

function MatchCard({
  match,
  champion,
  highlight,
}: {
  match: TournamentMatch;
  champion: boolean;
  highlight: boolean;
}) {
  const winner = winnerFromScore(match);

  return (
    <div
      className={cn(
        "relative flex h-full flex-col justify-center overflow-hidden rounded-lg border bg-card transition-ui hover:-translate-y-0.5 hover:border-primary/60",
        champion && "tb-gold border-transparent",
        highlight && !champion && "border-primary shadow-[0_0_0_3px] shadow-primary/25",
        !highlight && !champion && "border-border",
      )}
    >
      <PlayerRow
        name={slotLabel(match, "a")}
        seed={match.player_a_seed}
        score={match.score_a}
        won={winner === "a"}
        lost={winner === "b"}
        empty={match.player_a_name === null}
        champion={champion}
      />
      <PlayerRow
        name={slotLabel(match, "b")}
        seed={match.player_b_seed}
        score={match.score_b}
        won={winner === "b"}
        lost={winner === "a"}
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
      {match.status === "READY" && (
        <span className="absolute right-2 top-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          {MATCH_STATUS_LABEL.READY}
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
  lost,
  empty,
  champion,
}: {
  name: string;
  seed: number | null;
  score: number | null;
  won: boolean;
  lost: boolean;
  empty: boolean;
  champion: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 transition-colors",
        won &&
          "tb-win bg-linear-to-r from-primary/35 to-primary/10 font-semibold text-foreground shadow-[inset_4px_0_0_0] shadow-primary",
        !won && empty && "text-muted-foreground",
        !won && !empty && !lost && "text-on-surface-variant",
        lost && "text-muted-foreground opacity-60",
      )}
    >
      {seed !== null && (
        <span className="w-5 shrink-0 rounded bg-surface-low text-center text-[10px] tabular-nums text-muted-foreground">
          {seed}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate text-sm", lost && "line-through decoration-1")}>
        {name}
      </span>
      {champion && won && (
        <Trophy aria-hidden className="size-3.5 shrink-0" style={{ color: GOLD }} />
      )}
      <span
        className={cn(
          "shrink-0 font-display text-sm tabular-nums",
          won && "rounded bg-primary px-1.5 py-0.5 text-xs leading-none text-background",
        )}
      >
        {score ?? ""}
      </span>
    </div>
  );
}

/**
 * The stylised figure raising the cup, shared by the "final is set" and champion banners.
 *
 * Pure SVG, no image asset; the caller sizes it and adds the lift animation.
 */
function TrophyFigure({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 88" fill="none" aria-hidden className={className}>
      {/* soft floor glow */}
      <ellipse cx="48" cy="84" rx="24" ry="4" className="fill-primary/15" />

      {/* the cup */}
      <path d="M38 8h20v12a10 10 0 0 1-20 0z" className="fill-primary" />
      <path
        d="M34 11h-5a6 6 0 0 0 6 6M62 11h5a6 6 0 0 1-6 6"
        className="stroke-primary"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="46" y="30" width="4" height="5" className="fill-primary" />
      <rect x="41" y="35" width="14" height="4" rx="1.5" className="fill-primary" />
      {/* cup shine */}
      <path d="M42 11v8" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />

      {/* the figure: arms up, gripping the base */}
      <circle cx="48" cy="52" r="6" className="fill-current" />
      <path
        d="M48 58v16M48 74l-5 8M48 74l5 8"
        className="stroke-current"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M48 60 40 38M48 60 56 38"
        className="stroke-current"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A slowly turning sunburst, masked to fade out at the edge. Sits behind a trophy. */
function Rays({ className = "" }: { className?: string }) {
  const mask = "radial-gradient(closest-side, #000 25%, transparent 72%)";
  return (
    <div
      aria-hidden
      className={cn("tb-rays pointer-events-none absolute rounded-full", className)}
      style={{
        background:
          "repeating-conic-gradient(from 0deg, rgba(97,224,106,.26) 0deg 8deg, transparent 8deg 16deg)",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

const TWINKLES = [
  { x: "6%", y: "20%", d: "0s" },
  { x: "92%", y: "30%", d: ".5s" },
  { x: "14%", y: "78%", d: "1s" },
  { x: "84%", y: "82%", d: ".25s" },
];

/**
 * Shown above a bracket whose final is set but not yet decided: "get ready for the final".
 *
 * Sunburst, a trophy that floats, and the two finalists face to face. `motion-reduce`
 * drops the movement through the stylesheet.
 */
function FinalTrophy({ a, b }: { a: string; b: string }) {
  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-2">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <Rays className="-inset-8" />
        {TWINKLES.map((t, i) => (
          <span
            key={i}
            aria-hidden
            className="tb-twinkle absolute size-1.5 bg-primary"
            style={{ left: t.x, top: t.y, animationDelay: t.d }}
          />
        ))}
        <div className="tb-lift relative text-primary">
          <TrophyFigure className="h-22 w-24" />
        </div>
      </div>

      <span className="flex items-center gap-3 font-display text-xs uppercase tracking-[0.22em] text-primary">
        <span className="h-px w-8 bg-linear-to-r from-transparent to-primary" />
        Siap Final
        <span className="h-px w-8 bg-linear-to-l from-transparent to-primary" />
      </span>

      <div className="flex w-full min-w-0 items-center justify-center gap-2 px-2 font-display text-sm uppercase">
        <span className="min-w-0 flex-1 truncate text-right text-foreground">{a}</span>
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold leading-none text-background">
          VS
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-foreground">{b}</span>
      </div>
    </div>
  );
}

const CONFETTI = [
  { l: 4, d: 0, t: 3.2, c: "#61e06a" },
  { l: 11, d: 1.1, t: 2.8, c: GOLD },
  { l: 19, d: 0.4, t: 3.6, c: "#8ab4ff" },
  { l: 27, d: 1.9, t: 3, c: "#ff6b6b" },
  { l: 36, d: 0.8, t: 3.4, c: "#61e06a" },
  { l: 45, d: 2.3, t: 2.9, c: GOLD },
  { l: 54, d: 0.2, t: 3.5, c: "#8ab4ff" },
  { l: 62, d: 1.5, t: 3.1, c: "#ff6b6b" },
  { l: 71, d: 0.6, t: 3.3, c: "#61e06a" },
  { l: 79, d: 2.1, t: 2.8, c: GOLD },
  { l: 87, d: 1.2, t: 3.6, c: "#8ab4ff" },
  { l: 95, d: 0.9, t: 3, c: "#61e06a" },
];

/**
 * Shown above a bracket whose final is decided: who took the whole thing.
 *
 * Read from the score, so it can never disagree with the champion row in the tree. The
 * name is the point of the banner, so it is set large with a gradient fill, with a
 * sunburst, falling confetti and a shine sweeping across the whole strip.
 */
function ChampionBanner({ name }: { name: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/50 bg-linear-to-r from-primary/25 via-primary/10 to-transparent px-4 py-4 sm:px-6 sm:py-5">
      {/* confetti */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {CONFETTI.map((p, i) => (
          <span
            key={i}
            className="tb-conf absolute top-0 block h-2 w-1"
            style={{
              left: `${p.l}%`,
              background: p.c,
              animationDuration: `${p.t}s`,
              animationDelay: `${p.d}s`,
              opacity: 0,
            }}
          />
        ))}
        <span
          className="tb-sweep absolute inset-y-0 left-0 w-1/3"
          style={{
            background:
              "linear-gradient(100deg, transparent 20%, rgba(255,255,255,.16) 50%, transparent 80%)",
          }}
        />
      </div>

      <div className="relative flex items-center gap-4 sm:gap-6">
        <div className="relative flex h-21 w-21 shrink-0 items-center justify-center sm:h-24 sm:w-24">
          <Rays className="-inset-6" />
          <div className="tb-lift relative text-primary">
            <TrophyFigure className="h-16 w-17.5 sm:h-18.5 sm:w-20" />
          </div>
        </div>

        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-background"
            style={{ background: GOLD }}
          >
            <Crown aria-hidden className="size-3" />
            Juara
          </span>
          <p className="mt-1.5 truncate bg-linear-to-r from-primary via-[#d9ffd3] to-primary bg-clip-text font-display text-2xl uppercase leading-tight text-transparent sm:text-4xl">
            {name}
          </p>
        </div>
      </div>
    </div>
  );
}