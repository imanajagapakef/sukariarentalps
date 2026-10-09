/**
 * Countdown formatting for /tiket.
 *
 * Pure and import-free so a node test can call it. The component in
 * ticket-actions.tsx owns the ticking; this only turns a millisecond delta
 * into the digits a customer reads.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * `HH:MM:SS`, hours included.
 *
 * ponytail: hours are not wrapped at 24. A booking is at most a few hours out,
 * and `24:00:00` on a countdown would be a bug report rather than a feature. The
 * old `MM:SS` format rendered a 90-minute session as `90:00`, which reads as
 * ninety minutes rather than one hour thirty.
 */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}