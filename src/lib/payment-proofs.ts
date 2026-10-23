import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Bukti transfer yang diunggah pelanggan.
 *
 * Stored in a PRIVATE bucket (migration 0024) and handed to staff as a short-lived
 * signed URL. The public `media` bucket is fine for cover art and disqualifying for a
 * bank statement: those screenshots carry account numbers, the owner's name and a
 * balance, and a public bucket URL is guessable.
 */

export const PROOF_BUCKET = "payment-proofs";
/** Longer than a cashier's glance, short enough that a leaked URL dies on its own. */
export const PROOF_URL_TTL_SECONDS = 60 * 10;
/** The client downsizes to WebP before upload; this only bounds a hostile caller. */
export const MAX_PROOF_BYTES = 3 * 1024 * 1024;
/**
 * Enough for a customer to re-shoot a screenshot the cashier could not read, without
 * letting one booking fill the bucket.
 */
export const MAX_PROOFS_PER_BOOKING = 3;

export const PROOF_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export type PaymentProof = Database["public"]["Tables"]["payment_proofs"]["Row"];

/** Proof plus the signed URL staff actually opens. */
export type PaymentProofWithUrl = PaymentProof & { signedUrl: string | null };

export class ProofError extends Error {
  readonly isClientError: boolean;
  constructor(message: string, isClientError = true) {
    super(message);
    this.name = "ProofError";
    this.isClientError = isClientError;
  }
}

/**
 * Pure content-type sniffing from the file header. `file.type` is client-forged;
 * the magic bytes are the file itself. Returns the MIME kind or null when the
 * header matches nothing we accept.
 */
export function detectImageKind(bytes: Uint8Array): typeof PROOF_MIME_TYPES[number] | null {
  // Start offsets differ per format: a WebP hides its tag at 8-11 and an ISOBMFF
  // box carries "ftyp" at 4-7, so each read names its own offset explicitly.
  const starts = (offset: number, ...prefix: number[]) =>
    prefix.every((b, i) => bytes[offset + i] === b);
  // JPEG: FF D8 FF (SOI + marker)
  if (starts(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (starts(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  // WebP: "RIFF" at 0-3, size at 4-7, "WEBP" at 8-11
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  // AVIF: ISOBMFF box — size(0-3) + "ftyp"(4-7) + major brand (8-11)
  if (bytes.length >= 12 && starts(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}

async function checkProofFile(file: File): Promise<string | null> {
  if (!(PROOF_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Bukti harus berupa gambar JPG, PNG, WebP, atau AVIF.";
  }
  if (file.size > MAX_PROOF_BYTES) {
    return `Ukuran ${(file.size / (1024 * 1024)).toFixed(1)} MB melebihi batas 3 MB.`;
  }
  // A claimed image whose header disagrees is something else entirely (a renamed
  // script, a PDF, a payload). The first 16 bytes cover every sniffable format.
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectImageKind(header);
  if (!detected || detected !== file.type) {
    return "Isi file bukan gambar yang valid.";
  }
  return null;
}

/**
 * Stores one proof for a booking.
 *
 * Idempotency is per attempt, not per booking: re-shooting a screenshot is a normal
 * thing to do when the first one came out unreadable, so the cap counts rows instead
 * of rejecting the second upload outright.
 */
export async function createPaymentProof(
  db: SupabaseClient<Database>,
  bookingId: string,
  nominal: number,
  file: File,
  note?: string,
): Promise<PaymentProof> {
  const problem = await checkProofFile(file);
  if (problem) throw new ProofError(problem);

  const { count } = await db
    .from("payment_proofs")
    .select("proof_id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if ((count ?? 0) >= MAX_PROOFS_PER_BOOKING) {
    throw new ProofError(
      `Bukti sudah terkirim ${MAX_PROOFS_PER_BOOKING} kali. Hubungi kasir lewat WhatsApp kalau perlu mengirim ulang.`,
    );
  }

  // Timestamp in the key: two uploads of the same original filename must not overwrite
  // each other, and the old proof row has to keep pointing at something real.
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] ?? "webp").toLowerCase().replace(/[^a-z0-9]/g, "");
  const objectPath = `proof/${bookingId}/${Date.now()}.${ext || "webp"}`;

  const { error: uploadError } = await db.storage
    .from(PROOF_BUCKET)
    .upload(objectPath, file, { contentType: file.type, cacheControl: "3600" });
  if (uploadError) throw new ProofError(`Gagal menyimpan bukti: ${uploadError.message}`, false);

  const { data, error } = await db
    .from("payment_proofs")
    .insert({ booking_id: bookingId, nominal, note: note?.trim() || null, object_path: objectPath })
    .select()
    .single();
  if (error || !data) {
    // Do not leave an orphaned object behind if the row could not be written.
    await db.storage.from(PROOF_BUCKET).remove([objectPath]).catch(() => undefined);
    throw new ProofError(`Gagal mencatat bukti: ${error?.message}`, false);
  }
  return data;
}

/** Newest first, with a signed URL per row. Staff-only: this is the read path. */
export async function listPaymentProofs(
  db: SupabaseClient<Database>,
  bookingIds: string[],
): Promise<Map<string, PaymentProofWithUrl[]>> {
  const byBooking = new Map<string, PaymentProofWithUrl[]>();
  if (bookingIds.length === 0) return byBooking;

  const { data, error } = await db
    .from("payment_proofs")
    .select("proof_id, booking_id, nominal, note, object_path, created_at, tournament_registration_id")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (!row.booking_id) continue; // .in("booking_id", …) makes this unreachable; the column is typed nullable
    const { data: signed } = await db.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(row.object_path, PROOF_URL_TTL_SECONDS);
    const entry: PaymentProofWithUrl = { ...row, signedUrl: signed?.signedUrl ?? null };
    const list = byBooking.get(row.booking_id) ?? [];
    list.push(entry);
    byBooking.set(row.booking_id, list);
  }
  return byBooking;
}