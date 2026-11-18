import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BookingError } from "@/services/booking.service";

type DB = SupabaseClient<Database>;

/** Batas atas chip di halaman; juga jumlah quote yang dihitung. */
export const MAX_EXTENSION_HOURS = 3;
const HOUR_MS = 3_600_000;

export type ExtensionConfig = {
  minimum_extension_minutes: number;
  extension_interval_minutes: number;
  cleaning_duration_minutes: number;
};

export type ExtensionQuote = {
  minutes: number;
  /** Estimasi biaya tambahan, dari calculate_price() yang sama dengan /booking. */
  amount: number;
};

export type ExtensionOption = {
  minutes: number;
  amount: number;
  new_end_at: string;
};

export type ExtensionWindow = {
  endMs: number;
  /** Awal reservasi berikutnya, atau null kalau unit bebas. */
  boundaryMs: number | null;
  /** Batas akhir sesi yang aman: boundary dikurangi waktu pembersihan. */
  safeEndMs: number | null;
  options: ExtensionOption[];
  noRoom: boolean;
};

/**
 * Pilihan tambahan jam yang benar-benar muat.
 *
 * Satu tempat untuk halaman pelanggan, dialog kasir, dan validasi server:
 * RPC `request_extension` menolak `new_end + cleaning > boundary`, jadi UI tidak
 * boleh menawarkan angka yang akan ditolak.
 */
export function extensionWindow(
  info: {
    scheduled_end_at: string;
    latest_extendable_at: string | null;
    config: ExtensionConfig | null;
    quotes: ExtensionQuote[];
  },
  maxHours = MAX_EXTENSION_HOURS,
): ExtensionWindow {
  const endMs = Date.parse(info.scheduled_end_at);
  const boundaryMs = info.latest_extendable_at ? Date.parse(info.latest_extendable_at) : null;
  const cleaningMs = (info.config?.cleaning_duration_minutes ?? 0) * 60_000;
  const minimum = info.config?.minimum_extension_minutes ?? 60;
  const safeEndMs = boundaryMs === null ? null : boundaryMs - cleaningMs;

  const options: ExtensionOption[] = [];
  if (Number.isFinite(endMs) && (safeEndMs === null || safeEndMs > endMs)) {
    for (let n = 1; n <= maxHours; n += 1) {
      if (n * 60 < minimum) continue;
      const newEndMs = endMs + n * HOUR_MS;
      if (safeEndMs !== null && newEndMs > safeEndMs) break;
      const amount = info.quotes.find((q) => q.minutes === n * 60)?.amount ?? 0;
      options.push({ minutes: n * 60, amount, new_end_at: new Date(newEndMs).toISOString() });
    }
  }

  return { endMs, boundaryMs, safeEndMs, options, noRoom: options.length === 0 };
}

/**
 * Customer-facing extension view.
 *
 * `latest_extendable_at` adalah waktu mulai reservasi berikutnya di unit yang
 * sama, atau **null** kalau tidak ada yang menghalangi (migrasi 0045). Sebelum
 * 0045 fungsi mengembalikan jam selesai booking itu sendiri saat unit bebas,
 * sehingga halaman selalu menyimpulkan "tidak ada ruang" untuk booking terakhir
 * hari itu — justru yang paling bisa diperpanjang.
 *
 * Quote dihitung di server (bukan di klien) supaya angkanya memakai
 * calculate_price() yang sama dengan form booking: paket terpanjang yang muat
 * plus sisa jamnya. Kasir tetap yang mengonfirmasi; ini estimasi, bukan tagihan.
 */
export async function getExtensionInfo(db: DB, code: string) {
  const { data: booking, error } = await db
    .from("bookings")
    .select(
      "booking_id, booking_code, status, unit_id, scheduled_end_at, duration_minutes, branch_id, units(name, facility_type_id)",
    )
    .eq("booking_code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!booking) return null;

  const [{ data: boundary }, { data: rawCfg }] = await Promise.all([
    db.rpc("latest_extendable", { p_booking_id: booking.booking_id }),
    db.rpc("get_booking_config", { p_branch_id: booking.branch_id }),
  ]);

  const config = (rawCfg as ExtensionConfig | null) ?? null;
  const facilityTypeId = booking.units?.facility_type_id ?? null;

  const quotes: ExtensionQuote[] = facilityTypeId
    ? await Promise.all(
        Array.from({ length: MAX_EXTENSION_HOURS }, async (_, i) => {
          const minutes = (i + 1) * 60;
          const { data } = await db.rpc("calculate_price", {
            p_branch_id: booking.branch_id,
            p_facility_type_id: facilityTypeId,
            p_duration_minutes: minutes,
          });
          return { minutes, amount: typeof data === "number" ? data : 0 };
        }),
      )
    : [];

  return { ...booking, latest_extendable_at: boundary ?? null, config, quotes, active_extension: await activeExtension(db, booking.booking_id) };
}

/**
 * Perpanjangan terakhir yang masih aktif beserta status pembayarannya.
 *
 * Dipakai halaman /extension untuk menampilkan QR + unggah bukti walau daftar
 * opsi sudah habis (mis. setelah pelanggan menambah jam terakhir yang muat,
 * atau setelah halaman dimuat ulang).
 */
async function activeExtension(db: DB, bookingId: string) {
  const { data: extension } = await db
    .from("booking_extensions")
    .select("extension_id, amount, new_end_at, status, requested_minutes")
    .eq("booking_id", bookingId)
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!extension) return null;

  const { data: payment } = await db
    .from("payments")
    .select("status, method")
    .eq("extension_id", extension.extension_id)
    .maybeSingle();

  const { count } = await db
    .from("payment_proofs")
    .select("proof_id", { count: "exact", head: true })
    .eq("extension_id", extension.extension_id);

  return {
    ...extension,
    payment_status: payment?.status ?? null,
    payment_method: payment?.method ?? null,
    proof_count: count ?? 0,
  };
}

export type ExtensionResult = {
  extension_id: string;
  previous_end_at: string;
  new_end_at: string;
  amount: number;
  payment_id: string;
};

/**
 * Menambah jam sesi. Atomik di database: reservasi BOOKING + CLEANING digeser,
 * booking diperbarui, lalu satu baris extension dan satu pembayaran PENDING
 * dibuat. Melempar BookingError (4xx) kalau slot tidak cukup.
 */
export async function requestExtension(
  db: DB,
  bookingId: string,
  minutes: number,
  opts: { method?: "CASH" | "TRANSFER_MANUAL" | "QRIS_MANUAL"; requestedBy?: string | null } = {},
): Promise<ExtensionResult> {
  const { data, error } = await db
    .rpc("request_extension", {
      p_booking_id: bookingId,
      p_minutes: minutes,
      p_method: opts.method ?? "TRANSFER_MANUAL",
      p_requested_by: opts.requestedBy ?? null,
    })
    .single();

  if (error) throw new BookingError(error.message, error.code ?? "UNKNOWN");
  return data as ExtensionResult;
}

export async function cancelExtension(
  db: DB,
  extensionId: string,
  reason?: string,
): Promise<string> {
  const { data, error } = await db.rpc("cancel_extension", {
    p_extension_id: extensionId,
    p_reason: reason ?? null,
  });
  if (error) throw new BookingError(error.message, error.code ?? "UNKNOWN");
  return data as string;
}

/** Riwayat perpanjangan sebuah booking, terbaru dulu (untuk dialog kasir). */
export type ExtensionEntry = {
  extension_id: string;
  status: string;
  requested_minutes: number;
  previous_end_at: string;
  new_end_at: string;
  amount: number;
  created_at: string;
  /** Status pembayaran extension (PENDING / PAID / FAILED / REFUNDED). */
  payment_status: string | null;
  payment_method: string | null;
  /** Berapa bukti bayar yang sudah diunggah pelanggan. */
  proof_count: number;
};

export async function listExtensions(db: DB, bookingId: string): Promise<ExtensionEntry[]> {
  const { data: rows, error } = await db
    .from("booking_extensions")
    .select("extension_id, status, requested_minutes, previous_end_at, new_end_at, amount, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (rows ?? []).map((r) => r.extension_id);
  if (ids.length === 0) return [];

  const [{ data: payments }, { data: proofs }] = await Promise.all([
    db.from("payments").select("extension_id, status, method").in("extension_id", ids),
    db.from("payment_proofs").select("extension_id").in("extension_id", ids),
  ]);

  const paymentBy = new Map((payments ?? []).map((p) => [p.extension_id ?? "", p]));
  const proofsBy = new Map<string, number>();
  for (const p of proofs ?? []) {
    const key = p.extension_id ?? "";
    proofsBy.set(key, (proofsBy.get(key) ?? 0) + 1);
  }

  return (rows ?? []).map((r) => ({
    ...r,
    payment_status: paymentBy.get(r.extension_id)?.status ?? null,
    payment_method: paymentBy.get(r.extension_id)?.method ?? null,
    proof_count: proofsBy.get(r.extension_id) ?? 0,
  }));
}