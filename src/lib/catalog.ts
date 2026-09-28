import { createClient } from "@/lib/supabase/server";

/**
 * Server-side catalog reads. RLS allows anon SELECT on every catalog table,
 * so these run through the plain server client — no service_role needed.
 */

export type BranchRow = {
  branch_id: string;
  name: string;
  short_name: string | null;
  address: string | null;
  phone: string | null;
  operating_hours: string;
  google_rating: number | null;
  google_review_count: number | null;
  status: string;
};

export type UnitRow = {
  unit_id: string;
  name: string;
  status: string;
  condition: string;
  branch_id: string;
  facility_type_id: string;
  branches: { name: string; short_name: string | null } | null;
  facility_types: { name: string; platform: string; category: string } | null;
};

export type SnackRow = {
  snack_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
};

export type GameRow = {
  game_id: string;
  name: string;
  slug: string | null;
  short_description: string | null;
  developer: string | null;
  age_rating: string | null;
  game_platforms: { platform_id: string }[];
  game_availability: { branch_id: string | null; available: boolean }[];
};

export type PromoRow = {
  promotion_id: string;
  name: string;
  description: string | null;
  status: string;
  branch_id: string | null;
  promotion_items: {
    duration_minutes: number;
    price: number;
    facility_types: { name: string } | null;
  }[];
};

export async function getBranches(): Promise<BranchRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("branches")
    .select("branch_id, name, short_name, address, phone, operating_hours, google_rating, google_review_count, status")
    .eq("status", "ACTIVE")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as BranchRow[];
}

export async function getUnitsWithFacility(): Promise<UnitRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("units")
    .select(
      "unit_id, name, status, condition, branch_id, facility_type_id, branches(name, short_name), facility_types(name, platform, category)",
    )
    .order("branch_id")
    .order("unit_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as UnitRow[];
}

/**
 * Game catalogue. Filter chips stay hidden until game_features is filled —
 * only a fraction of games have features now.
 * ponytail: re-enable a feature-based filter when game_features coverage is
 * high; until then show catalogue only (Fase C checklist item 11).
 */
export async function getGames(): Promise<GameRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("games")
    .select(
      "game_id, name, slug, short_description, developer, age_rating, game_platforms(platform_id), game_availability(branch_id, available)",
    )
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as GameRow[];
}

export async function getPlatforms() {
  const db = await createClient();
  const { data, error } = await db
    .from("platforms")
    .select("platform_id, name")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSnacks(): Promise<SnackRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("snacks")
    .select("snack_id, name, category, price, stock, min_stock")
    .eq("active", true)
    .order("category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SnackRow[];
}

export async function getPromotions(): Promise<PromoRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("promotions")
    .select(
      "promotion_id, name, description, status, branch_id, promotion_items(duration_minutes, price, facility_types(name))",
    )
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PromoRow[];
}
