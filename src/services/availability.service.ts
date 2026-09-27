import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

export type AvailableUnit = {
  unit_id: string;
  unit_name: string;
  facility_type_id: string;
  status: Database["public"]["Enums"]["unit_status"];
};

export async function getAvailableUnits(
  db: DB,
  branchId: string,
  startAt: string,
  endAt: string,
): Promise<AvailableUnit[]> {
  const { data, error } = await db.rpc("get_available_units", {
    p_branch_id: branchId,
    p_start: startAt,
    p_end: endAt,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as AvailableUnit[];
}

export async function nextAvailable(
  db: DB,
  unitId: string,
  from?: string,
): Promise<string> {
  const { data, error } = await db.rpc("next_available", {
    p_unit_id: unitId,
    ...(from ? { p_from: from } : {}),
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export async function latestExtendable(
  db: DB,
  bookingId: string,
): Promise<string | null> {
  const { data, error } = await db.rpc("latest_extendable", {
    p_booking_id: bookingId,
  });

  if (error) throw new Error(error.message);
  return data as string | null;
}