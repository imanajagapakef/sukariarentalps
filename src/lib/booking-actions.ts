/**
 * Which transitions staff can trigger from a given status. Kept out of
 * action-buttons.tsx because that file is "use client", and a server component
 * cannot call a client export — the page needs this to decide whether to render a
 * dash in the Aksi column. One map, so the buttons and the table cannot disagree.
 */
export const BOOKING_ACTIONS: Record<string, { label: string; action: string; danger?: boolean }[]> = {
  WAITING_PAYMENT: [
    { label: "Konfirmasi", action: "confirm" },
    { label: "Batalkan", action: "cancel", danger: true },
  ],
  CONFIRMED: [
    { label: "Check-in", action: "check_in" },
    { label: "No-show", action: "no_show", danger: true },
    { label: "Batalkan", action: "cancel", danger: true },
  ],
  IN_USE: [{ label: "Selesai (check-out)", action: "complete" }],
  COMPLETED: [{ label: "Unit Siap", action: "mark_ready" }],
  READY: [],
};

/** Terminal statuses have nothing to do, so the table renders a dash instead. */
export const hasBookingActions = (status: string) => (BOOKING_ACTIONS[status] ?? []).length > 0;

/**
 * Realtime channel a staff action pings and the customer's booking page listens
 * on. One function so the two sides cannot spell the channel differently and
 * silently stop hearing each other.
 */
export const bookingChannel = (code: string) => `booking:${code}`;
