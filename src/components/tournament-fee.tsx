import { feeDisplay, fillPercent, seatsLeft, type Tournament } from "@/lib/tournament-rules";
import { rp } from "@/lib/format";

/**
 * The fee line, including the GRATIS sticker.
 *
 * A free tournament with a list price shows that price struck through with the sticker
 * sitting on top of it — the way a poster would. Without a list price the sticker stands
 * alone, and a paid tournament shows just the amount. Which of the three happens is
 * decided by feeDisplay() so the same rule governs the card, the detail page and the
 * ticket.
 */
export function FeeTag({
  tournament,
  size = "md",
}: {
  tournament: Pick<Tournament, "registration_fee" | "list_price">;
  size?: "sm" | "md" | "lg";
}) {
  const fee = feeDisplay(tournament);
  const scale =
    size === "lg"
      ? "text-2xl"
      : size === "sm"
        ? "text-sm"
        : "text-base";

  if (fee.kind === "paid") {
    return (
      <span className={`font-display ${scale} text-primary`}>
        {rp(fee.amount)}
        <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">
          / orang
        </span>
      </span>
    );
  }

  /* The sticker leans and sits across the price rather than under it: that overlap is
     what makes it read as a sticker slapped on a poster rather than a second line of
     copy. Centring is by fraction of the wrapper rather than a guessed offset, so it
     holds at every text size; `min-h` reserves the sticker's own height for the
     free-without-list-price case, where there is no price line to centre on. */
return (
    <span className="relative inline-flex min-h-[24px] flex-col items-start pr-1 pt-2.5">
      {fee.strikePrice ? (
        <span className={`${scale} text-muted-foreground line-through decoration-2`}>
          {rp(fee.strikePrice)}
        </span>
      ) : null}
      <span
        className={`absolute left-0 top-1/2 -translate-y-1/2 -rotate-6 rounded-md bg-primary px-2 py-1 font-display uppercase leading-none text-primary-foreground shadow-md ring-1 ring-primary-foreground/25 ${
          size === "lg" ? "text-base" : "text-xs"
        }`}
      >
        Gratis
      </span>
    </span>
  );
}

/** Seats taken vs quota, as a bar. Hidden entirely for a tournament nobody has entered. */
export function SeatMeter({
  tournament,
  className = "",
}: {
  tournament: Pick<Tournament, "quota" | "held">;
  className?: string;
}) {
  const left = seatsLeft(tournament);
  const held = tournament.held ?? 0;
  if (held === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {held}/{tournament.quota} kursi terisi
        </span>
        <span className={left === 0 ? "text-warning font-medium" : undefined}>
          {left === 0 ? "Penuh" : `${left} kursi tersisa`}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-low"
        role="progressbar"
        aria-valuenow={fillPercent(tournament)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Kursi terisi"
      >
        <div
          className={`h-full rounded-full ${left === 0 ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${fillPercent(tournament)}%` }}
        />
      </div>
    </div>
  );
}