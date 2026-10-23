import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentProofSchema } from "@/lib/validations/booking";
import { getBookingByCode } from "@/services/booking.service";
import { createPaymentProof, ProofError } from "@/lib/payment-proofs";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Customer uploads proof of transfer against a booking code.
 *
 * Public, keyed by booking code — the same capability boundary that already exposes
 * /tiket/[code]. The proof bucket has no insert policy for anon, so this route is the
 * only way in; it uses the service role and therefore has to be the thing that decides
 * what is acceptable.
 *
 * A proof is a claim, never an authorisation. Nothing here changes booking status:
 * only the cashier's "Konfirmasi" does that.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const limit = rateLimit("proofUpload", request, code);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError("Gunakan multipart/form-data", 400);
    }

    const parsed = paymentProofSchema.safeParse({
      nominal: form.get("nominal"),
      note: form.get("note") ?? undefined,
    });
    if (!parsed.success) {
      return jsonError("Nominal tidak valid", 400);
    }

    const file = form.get("proof");
    if (!(file instanceof File) || file.size === 0) {
      return jsonError("File bukti tidak ditemukan", 400);
    }

    const db = createAdminClient();
    const booking = await getBookingByCode(db, code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);
    // Once settled or expired there is nothing left to prove, and the slot may already
    // be somebody else's.
    if (booking.status !== "WAITING_PAYMENT") {
      return jsonError(`Booking ini sudah ${booking.status}`, 409);
    }

    // The transfer amount must be exactly the booking total, or the cashier is
    // reconciling a number the system never asked for.
    if (parsed.data.nominal !== booking.total_amount) {
      return jsonError(`Nominal transfer harus tepat ${booking.total_amount} (total booking)`, 400);
    }

    const proof = await createPaymentProof(
      db,
      booking.booking_id,
      parsed.data.nominal,
      file,
      parsed.data.note,
    );

    return NextResponse.json(
      { proof_id: proof.proof_id, nominal: proof.nominal, created_at: proof.created_at },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProofError) return jsonError(error.message, error.isClientError ? 400 : 500);
    return handleRouteError(error);
  }
}