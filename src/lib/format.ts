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
  IN_USE: "success",
  IN_ORDER: "warning",
  MAINTENANCE: "danger",
  OFFLINE: "danger",
};

export const TONE_CLASS: Record<Tone, string> = {
  success: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
  neutral: "bg-muted text-muted-foreground",
};

const COVER_TINTS = ["#20a83a", "#1d6f8b", "#8b5a1d", "#6b3fa0", "#a03f5c", "#3f6ba0", "#4d7a2a"];

/** Deterministic brand-tinted placeholder — covers arrive in a later pass. */
export function coverTint(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COVER_TINTS[h % COVER_TINTS.length];
}
