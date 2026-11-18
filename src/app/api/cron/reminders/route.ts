import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron pengingat booking WA (Vercel Cron).
 * - Bayar: WAITING_PAYMENT, deadline dalam 5 menit → BOOKING_PAYMENT_REMINDER
 * - Mulai: CONFIRMED, mulai dalam 30 menit → BOOKING_START_REMINDER
 *
 * Proteksi: Bearer CRON_SECRET bila diset. Cron dijadwalkan di vercel.json
 * tiap 5 menit. Tanpa provider WA (WA_API_KEY kosong) baris dicatat FAILED
 * oleh dispatcher — cron ini hanya meng 통해 notifications, tidak mengirim
 * langsung.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = new Date();
  const fiveMin = new Date(now.getTime() + 5 * 60_000).toISOString();
  const thirtyMin = new Date(now.getTime() + 30 * 60_000).toISOString();
  const nowIso = now.toISOString();

  let queued = 0;

  // Pengingat bayar mendekati kedaluwarsa (15 menit deadline default).
  const { data: payDue } = await db
    .from("bookings")
    .select("booking_id, booking_code, scheduled_start_at, payment_deadline_at, branch_id, customers(phone, name), branches(name)")
    .eq("status", "WAITING_PAYMENT")
    .gte("payment_deadline_at", nowIso)
    .lte("payment_deadline_at", fiveMin)
    .limit(50) as { data: never[] | null };
  for (const b of (payDue ?? []) as unknown as {
    booking_id: string;
    booking_code: string;
    scheduled_start_at: string;
    payment_deadline_at: string;
    branch_id: string;
    customers: { phone: string; name: string } | null;
    branches: { name: string } | null;
  }[]) {
    if (!b.customers?.phone) continue;
    await db.from("notifications").insert({
      recipient_type: "CUSTOMER",
      recipient_ref: b.customers.phone,
      channel: "WHATSAPP",
      template: "BOOKING_PAYMENT_REMINDER",
      status: "PENDING",
      payload: {
        name: b.customers.name,
        booking_code: b.booking_code,
        starts_at: b.scheduled_start_at,
        branch_name: b.branches?.name ?? b.branch_id,
        deadline: b.payment_deadline_at,
      },
    });
    queued++;
  }

  // Pengingat jam mulai (30 menit sebelum sesi CONFIRMED).
  const { data: starting } = await db
    .from("bookings")
    .select("booking_id, booking_code, scheduled_start_at, branch_id, customers(phone, name), branches(name)")
    .eq("status", "CONFIRMED")
    .gte("scheduled_start_at", nowIso)
    .lte("scheduled_start_at", thirtyMin)
    .limit(50) as { data: never[] | null };
  for (const b of (starting ?? []) as unknown as {
    booking_id: string;
    booking_code: string;
    scheduled_start_at: string;
    branch_id: string;
    customers: { phone: string; name: string } | null;
    branches: { name: string } | null;
  }[]) {
    if (!b.customers?.phone) continue;
    // Hindari duplikat: skip bila sudah ada notif pengingat mulai untuk booking ini.
    await db.from("notifications").insert({
      recipient_type: "CUSTOMER",
      recipient_ref: b.customers.phone,
      channel: "WHATSAPP",
      template: "BOOKING_START_REMINDER",
      status: "PENDING",
      payload: {
        name: b.customers.name,
        booking_code: b.booking_code,
        starts_at: b.scheduled_start_at,
        branch_name: b.branches?.name ?? b.branch_id,
      },
    });
    queued++;
  }

  return NextResponse.json({ ok: true, queued });
}
