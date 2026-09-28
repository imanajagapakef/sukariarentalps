import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

/**
 * Customer-facing extension view. ponytail: extension WRITE is not built — no
 * extend_booking RPC exists yet; customers request the extension at the
 * cashier. Add POST /api/bookings/[code]/extend + extend_booking RPC when
 * self-service extension is productized.
 */
export async function getExtensionInfo(db: DB, code: string) {
  const { data: booking, error } = await db
    .from("bookings")
    .select("booking_id, booking_code, status, unit_id, scheduled_end_at, duration_minutes, branch_id, units(name, facility_type_id)")
    .eq("booking_code", code.trim().toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!booking) return null;

  const { data: boundary } = await db.rpc("latest_extendable", { p_booking_id: booking.booking_id });
  return { ...booking, latest_extendable_at: boundary ?? null };
}
