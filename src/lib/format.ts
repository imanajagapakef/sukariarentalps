const rpFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export const rp = (n: number) => rpFormatter.format(n);

const dtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
const dFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const tFormatter = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" });

export const fmtDateTime = (iso: string) => dtFormatter.format(new Date(iso));
export const fmtDate = (iso: string) => dFormatter.format(new Date(iso));
export const fmtTime = (iso: string) => tFormatter.format(new Date(iso));

// en-CA renders as YYYY-MM-DD, which is what <input type="date"> expects.
const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Calendar day in the lounge's timezone.
 *
 * Do not use toISOString().slice(0, 10) for this: that is UTC, so between 00:00
 * and 07:00 WIB it returns yesterday, and the booking form would default to a
 * day that is already over for a venue that never closes.
 */
export const fmtISODay = (d: Date) => isoDayFormatter.format(d);

/**
 * Durasi sewa dalam jam, karena itu satu-satunya satuan yang bisa dipilih sejak
 * opsi 30 menit dihapus (migrasi 0021). Booking lama yang berdurasi ganjil tetap
 * tampil apa adanya supaya riwayat tidak berubah artinya.
 */
export const fmtDuration = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} Jam` : `${minutes} mnt`;

export const BOOKING_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  WAITING_PAYMENT: "Menunggu Pembayaran",
  CONFIRMED: "Terkonfirmasi",
  IN_USE: "Sedang Main",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
  EXPIRED: "Kedaluwarsa",
  NO_SHOW: "Tidak Hadir",
};

export const UNIT_LABEL: Record<string, string> = {
  AVAILABLE: "Tersedia",
  BOOKED: "Dipesan",
  IN_USE: "Sedang Dipakai",
  IN_ORDER: "Antrian / Dibersihkan",
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
};

type Tone = "success" | "warning" | "danger" | "neutral";

export const BOOKING_TONE: Record<string, Tone> = {
  WAITING_PAYMENT: "warning",
  CONFIRMED: "success",
  IN_USE: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  EXPIRED: "danger",
  NO_SHOW: "danger",
  DRAFT: "neutral",
};

export const UNIT_TONE: Record<string, Tone> = {
  AVAILABLE: "success",
  BOOKED: "warning",
  IN_USE: "warning",
  IN_ORDER: "neutral",
  MAINTENANCE: "danger",
  OFFLINE: "danger",
};

const COVER_TINTS = ["#20a83a", "#1d6f8b", "#8b5a1d", "#6b3fa0", "#a03f5c", "#3f6ba0", "#4d7a2a"];

/**
 * Display names for the catalogue's coarse genre vocabulary (uppercase, slash-joined).
 * The full key set is what migration 0018 wrote; anything unmapped falls back to the
 * raw value, so a new genre degrades to shouting rather than to "undefined".
 */
export const GENRE_LABEL: Record<string, string> = {
  ACTION: "Action",
  ADVENTURE: "Adventure",
  RPG: "RPG",
  "ACTION/RPG": "Action · RPG",
  "ACTION/ADVENTURE": "Action · Adventure",
  "ACTION/CO-OP": "Action · Co-op",
  "ACTION/ADVENTURE/CO-OP": "Action · Adventure · Co-op",
  SHOOTER: "Shooter",
  "SHOOTER/CO-OP": "Shooter · Co-op",
  "SURVIVAL HORROR": "Survival Horror",
  RACING: "Racing",
  SPORT: "Sport",
  FIGHTING: "Fighting",
  PARTY: "Party",
  "PARTY/CO-OP": "Party · Co-op",
  PLATFORMER: "Platformer",
  "PLATFORMER/PUZZLE": "Platformer · Puzzle",
  MUSIC: "Music",
  SIMULATION: "Simulation",
  CASUAL: "Casual",
};
/** Deterministic brand-tinted placeholder — covers arrive in a later pass. */
export function coverTint(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_TINTS[h % COVER_TINTS.length];
}
