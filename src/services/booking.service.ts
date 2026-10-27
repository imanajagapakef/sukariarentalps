import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { CreateBookingInput } from "@/lib/validations/booking";

type DB = SupabaseClient<Database>;
type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type CreateBookingResult = {
  booking_id: string;
  booking_code: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  total_amount: number;
  payment_deadline_at: string;
};

/** Postgres error codes we surface as 4xx instead of 5xx. */
const CLIENT_ERROR_CODES = new Set(["22023", "23P01", "23505", "23514"]);

export class BookingError extends Error {
  readonly code: string;
  readonly isClientError: boolean;

  constructor(message: string, code = "UNKNOWN") {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.isClientError = CLIENT_ERROR_CODES.has(code);
  }
}

function wrap(error: { message: string; code?: string }): BookingError {
  // The booking engine raises with stable error codes; a slot clash is 23P01
  // from the GiST exclusion constraint.
  return new BookingError(error.message, error.code ?? "UNKNOWN");
}

export async function createBooking(
  db: DB,
  input: CreateBookingInput,
  opts?: { source?: Database["public"]["Enums"]["booking_source"]; createdBy?: string },
): Promise<CreateBookingResult> {
  const { data, error } = await db
    .rpc("create_booking", {
      p_branch_id: input.branch_id,
      p_unit_id: input.unit_id,
      p_customer_name: input.customer_name,
      p_customer_phone: input.customer_phone,
      ...(input.start_at ? { p_start_at: input.start_at } : {}),
      p_duration_minutes: input.duration_minutes,
      p_customer_email: input.customer_email || undefined,
      p_game_id: input.game_id,
      p_snacks: input.snacks,
      p_source: opts?.source ?? "ONLINE",
      p_created_by: opts?.createdBy,
      p_notes: input.notes,
      ...(input.promotion_id ? { p_promotion_id: input.promotion_id } : {}),
    })
    .single();

  if (error) throw wrap(error);
  return data as CreateBookingResult;
}

export type WalkInInput = CreateBookingInput & {
  payMethod: Extract<Database["public"]["Enums"]["payment_method"], "CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL">;
};

/**
 * Walk-in = same atomic create, then staff collects money at the counter:
 * confirmed immediately + a manual payment row, all in the caller's session.
 */
export async function createWalkInBooking(
  db: DB,
  input: WalkInInput,
  actor: { userId: string },
): Promise<CreateBookingResult & { status: BookingStatus; payment_status: string }> {
  const booking = await createBooking(db, input, { source: "WALK_IN", createdBy: actor.userId });
  const status = await confirmBooking(db, booking.booking_id);

  const { error: payError } = await db.from("payments").insert({
    booking_id: booking.booking_id,
    provider: input.payMethod === "CASH" ? "CASH" : "MANUAL",
    method: input.payMethod,
    status: "PAID",
    gross_amount: booking.total_amount,
    paid_at: new Date().toISOString(),
  });
  if (payError) throw wrap(payError);

  return { ...booking, status, payment_status: "PAID" };
}

export async function confirmBooking(db: DB, bookingId: string): Promise<BookingStatus> {
  const { data, error } = await db.rpc("confirm_booking", { p_booking_id: bookingId });
  if (error) throw wrap(error);
  return data as BookingStatus;
}

export async function checkIn(db: DB, bookingId: string): Promise<BookingStatus> {
  const { data, error } = await db.rpc("check_in", { p_booking_id: bookingId });
  if (error) throw wrap(error);
  return data as BookingStatus;
}

export async function completeBooking(db: DB, bookingId: string): Promise<BookingStatus> {
  const { data, error } = await db.rpc("complete_booking", { p_booking_id: bookingId });
  if (error) throw wrap(error);
  return data as BookingStatus;
}

export async function cancelBooking(
  db: DB,
  bookingId: string,
  reason?: string,
): Promise<BookingStatus> {
  const { data, error } = await db.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw wrap(error);
  return data as BookingStatus;
}

export async function markNoShow(db: DB, bookingId: string): Promise<BookingStatus> {
  const { data, error } = await db.rpc("mark_no_show", { p_booking_id: bookingId });
  if (error) throw wrap(error);
  return data as BookingStatus;
}

export async function markUnitReady(
  db: DB,
  unitId: string,
): Promise<Database["public"]["Enums"]["unit_status"]> {
  const { data, error } = await db.rpc("mark_unit_ready", { p_unit_id: unitId });
  if (error) throw wrap(error);
  return data as Database["public"]["Enums"]["unit_status"];
}

export type BookingDetail = Database["public"]["Tables"]["bookings"]["Row"] & {
  booking_items: Database["public"]["Tables"]["booking_items"]["Row"][];
  customers: { name: string | null; phone: string | null } | null;
  /** R5: named so the ticket can say which promo paid, not only how much came off. */
  promotions: { name: string } | null;
};

/** Customer-facing lookup by booking code. No login required. */
export async function getBookingByCode(
  db: DB,
  code: string,
): Promise<BookingDetail | null> {
  const { data, error } = await db
    .from("bookings")
    // `promotions(name)` rather than a second query: the ticket already loads the
    // booking, and a promo label read from a separate round trip could disagree with
    // the discount printed next to it if the promo were renamed between the two.
    .select("*, booking_items(*), customers(name, phone), promotions(name)")
    .eq("booking_code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw wrap(error);
  return data as BookingDetail | null;
}

/**
 * Verifies the caller knows the last 4 digits of the phone on the booking.
 * Returns a discriminated union so the route can answer 404 vs 401 without
 * accidentally leaking which one failed to anyone timing responses.
 */
export type BookingAccessResult =
  | { ok: true; booking: BookingDetail }
  | { ok: false; state: "not_found" | "wrong_last4" };

export async function verifyBookingAccessByCode(
  db: DB,
  code: string,
  last4: string,
): Promise<BookingAccessResult> {
  const booking = await getBookingByCode(db, code);
  if (!booking) return { ok: false, state: "not_found" };

  const digits = (value: string) => (value.match(/\d/g) ?? []).join("");
  const given = digits(last4);
  const onFile = digits(booking.customers?.phone ?? "").slice(-4);
  if (given.length !== 4) {
    return { ok: false, state: "wrong_last4" };
  }
  // Constant-time so response timing does not reveal how many digits matched.
  const same = timingSafeEqual(
    Buffer.from(given.padEnd(4, "\0"), "utf8"),
    Buffer.from(onFile.padEnd(4, "\0"), "utf8"),
  );
  if (!same) {
    return { ok: false, state: "wrong_last4" };
  }
  return { ok: true, booking };
}