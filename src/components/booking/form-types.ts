/**
 * Tipe & helper yang dipakai bersama oleh langkah-langkah form booking.
 *
 * Dipisah dari `booking-form.tsx` supaya tiap langkah bisa menjadi modul
 * sendiri tanpa mengimpor dari induknya (circular import) — dan supaya
 * bentuk data yang masuk ke client jelas dalam satu tempat.
 */

/** Minimal shapes: only the fields the form renders ride in the RSC payload. */
export type FormBranch = { branch_id: string; name: string };
export type FormUnit = {
  unit_id: string;
  name: string;
  status: string;
  branch_id: string;
  facility_type_id: string;
  facility_types: { name: string; category: string } | null;
};
export type FormGame = {
  game_id: string;
  name: string;
  game_availability: { branch_id: string | null; available: boolean }[];
};
export type FormSnack = { snack_id: string; name: string; price: number; stock: number; min_stock: number };

export type BookingConfig = {
  minimum_duration_minutes: number;
  maximum_duration_minutes: number;
  booking_interval_minutes: number;
  payment_deadline_minutes: number;
  advance_booking_days: number;
};

export function durationOptions(cfg: BookingConfig | null) {
  const min = cfg?.minimum_duration_minutes ?? 60;
  const max = cfg?.maximum_duration_minutes ?? 360;
  // Fallback 60, bukan 30: satu jam adalah satu-satunya durasi yang bisa dipilih
  // sejak opsi 30 menit dihapus (migrasi 0021).
  const step = cfg?.booking_interval_minutes ?? 60;
  const out: number[] = [];
  for (let d = min; d <= max; d += step) out.push(d);
  return out;
}

/** Same rules the server applies, so a mistake is reported on the field itself instead
 *  of arriving as a generic "Data booking tidak valid" after the POST. */
export function nameError(value: string): string | undefined {
  return value.trim().length < 2 ? "Nama wajib diisi (minimal 2 huruf)." : undefined;
}

export function phoneError(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return "Nomor WhatsApp wajib diisi.";
  if (!/^(\+?62|0)8\d{7,13}$/.test(phone)) {
    return "Nomor WhatsApp tidak valid (format 08xx / +628xx / 628xx).";
  }
  return undefined;
}
