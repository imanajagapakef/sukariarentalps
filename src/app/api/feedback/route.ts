import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";

const feedbackSchema = z
  .object({
    booking_code: z.string().trim().min(1).optional(),
    rating: z.number().int().min(1).max(5),
    service_rating: z.number().int().min(1).max(5).optional(),
    unit_rating: z.number().int().min(1).max(5).optional(),
    cleanliness_rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

/** ponytail: anonymous writes — auth comes with Fase E; rate-limit at the edge before launch. */
export async function POST(request: NextRequest) {
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: "Data feedback tidak valid" } }, { status: 400 });

  const db = createAdminClient();
  let bookingId: string | null = null;

  if (parsed.data.booking_code) {
    const booking = await getBookingByCode(db, parsed.data.booking_code);
    if (!booking) return NextResponse.json({ error: { message: "Booking tidak ditemukan" } }, { status: 404 });
    bookingId = booking.booking_id;
  }

  const { data, error } = await db
    .from("feedback")
    .insert({
      booking_id: bookingId,
      rating: parsed.data.rating,
      service_rating: parsed.data.service_rating ?? null,
      unit_rating: parsed.data.unit_rating ?? null,
      cleanliness_rating: parsed.data.cleanliness_rating ?? null,
      comment: parsed.data.comment || null,
    })
    .select("feedback_id")
    .single();

  if (error) return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  return NextResponse.json({ feedback_id: data.feedback_id }, { status: 201 });
}
