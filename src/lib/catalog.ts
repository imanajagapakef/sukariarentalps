import { cache } from "react";
import { createPublicClient as createClient } from "@/lib/supabase/public";
import type { PromoOffering } from "@/lib/promo-rules";
import { isWorthwhile } from "@/lib/promo-rules";

/**
 * Server-side catalog reads. RLS allows anon SELECT on every catalog table
 * (`create policy "public read" ... for select to anon`), so these run through the
 * cookieless anon client — no session, no cookies(), no service_role.
 *
 * Caching, precisely: the client in `lib/supabase/public` is the one that decides, by
 * passing `next.revalidate` to every fetch. There is no `unstable_cache` here and there
 * does not need to be — the data cache already lives one layer down. `cache()` from React
 * is *not* that cache: it only dedupes repeated calls inside a single render.
 *
 * Only branches keep the 300 s default. Everything a booking depends on — unit status,
 * snack stock, promo eligibility — is read live, because a stale row there means the
 * customer is offered something that cannot be booked. Games are the one middle case:
 * `getGames` defaults to the 300 s cache for browsing pages, while /booking asks for
 * `revalidate: 0` because `game_availability` decides which games a branch can offer.
 */

export type BranchRow = {
  branch_id: string;
  image_url: string | null;
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
  image_url: string | null;
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
  image_url: string | null;
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
};

export type GameFeatures = { genre: string | null };

export type GameRow = {
  game_id: string;
  image_url: string | null;
  name: string;
  slug: string | null;
  short_description: string | null;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  age_rating: string | null;
  game_features: GameFeatures[] | GameFeatures | null;
  game_platforms: { platform_id: string }[];
  game_availability: { branch_id: string | null; available: boolean }[];
};

export type GameDetailRow = GameRow & {
  description: string | null;
  publisher: string | null;
  release_date: string | null;
  game_features: {
    genre: string | null;
    local_multiplayer: boolean;
    online_multiplayer: boolean;
    co_op: boolean;
    competitive: boolean;
    single_player: boolean;
    max_local_players: number | null;
    recommended_players: string | null;
    research_status: string;
  } | null;
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

export const getBranches = cache(async (): Promise<BranchRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("branches")
    .select("branch_id, image_url, name, short_name, address, phone, operating_hours, google_rating, google_review_count, status")
    .eq("status", "ACTIVE")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as BranchRow[];
});

const UNIT_SCALARS =
  "unit_id, image_url, name, status, condition, branch_id, facility_type_id, branches(name, short_name), facility_types(name, platform, category)";

export async function getUnitsWithFacility(): Promise<UnitRow[]> {
  const db = createClient();
  const { data, error } = await db
    .from("units")
    .select(UNIT_SCALARS)
    .order("branch_id")
    .order("unit_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as UnitRow[];
}

/**
 * Game catalogue.
 *
 * `game_features.genre` rides along so the genre filter can run client-side over the
 * page's own result set. Migration 0018 filled genre for all 58 games, which is what
 * makes that filter worth showing — before it, 6 of 58 rows had features and a genre
 * chip would have hidden almost the whole catalogue.
 */
/**
 * The genre for a game, whichever shape the embed came back in.
 *
 * `getGames()` selects `game_features(genre)` (to-many, so an array) while
 * `getRelatedGames()` uses `game_features!inner(genre)` (to-one, so an object).
 * Both land in `GameRow`, so callers read the genre through here instead of guessing.
 */
export function gameGenre(g: Pick<GameRow, "game_features">): string | null {
  const f = g.game_features;
  if (!f) return null;
  return Array.isArray(f) ? (f[0]?.genre ?? null) : (f.genre ?? null);
}

export async function getGames(options?: { revalidate?: number }): Promise<GameRow[]> {
  const db = createClient(options);
  const { data, error } = await db
    .from("games")
    .select(
      `${GAME_SCALARS}, game_platforms(platform_id), ${GAME_AVAIL}, game_features(genre)`,
    )
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as GameRow[];
}

export async function getPlatforms() {
  const db = createClient();
  const { data, error } = await db
    .from("platforms")
    .select("platform_id, name")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const getGameBySlug = cache(async (slug: string): Promise<GameDetailRow | null> => {
  const db = createClient();
  const { data, error } = await db
    .from("games")
    .select(
      `game_id, image_url, name, slug, short_description, description, developer, publisher, release_date, age_rating,
       game_platforms(platform_id),
       game_availability(branch_id, available),
       game_features(genre, local_multiplayer, online_multiplayer, co_op, competitive, single_player, max_local_players, recommended_players, research_status)`,
    )
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as GameDetailRow | null;
});

const GAME_SCALARS =
  "game_id, image_url, name, slug, short_description, developer, publisher, release_date, age_rating";
const GAME_AVAIL = "game_availability(branch_id, available)";

/**
 * Games to show in the "cari yang mirip" row.
 *
 * Prefers same-genre, but game_features only covers 6 of 58 games, so a
 * genre-only lookup returned nothing for most of the catalogue and the whole
 * section was dead code. Falls back to same-platform, which every game has.
 *
 * Note: a relation may only be embedded once per select. Embedding
 * game_platforms both plainly and as !inner makes PostgREST emit a duplicate
 * FROM subquery and fail with "aggregate functions are not allowed in FROM
 * clause of their own query level".
 */
export async function getSimilarGames(
  genre: string | null,
  excludeGameId: string,
  platformId?: string | null,
  limit = 6,
): Promise<GameRow[]> {
  if (!genre && !platformId) return [];
  const db = createClient();

  if (genre) {
    const { data, error } = await db
      .from("games")
      .select(
        `${GAME_SCALARS}, game_platforms(platform_id), ${GAME_AVAIL}, game_features!inner(genre)`,
      )
      .eq("active", true)
      .eq("game_features.genre", genre)
      .neq("game_id", excludeGameId)
      .limit(limit);
    if (error) throw new Error(error.message);
    if (data?.length) return data as GameRow[];
  }

  if (platformId) {
    const { data, error } = await db
      .from("games")
      .select(`${GAME_SCALARS}, game_platforms!inner(platform_id), ${GAME_AVAIL}`)
      .eq("active", true)
      .eq("game_platforms.platform_id", platformId)
      .neq("game_id", excludeGameId)
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as GameRow[];
  }

  return [];
}

export async function getSnacks(): Promise<SnackRow[]> {
  const db = createClient();
  const { data, error } = await db
    .from("snacks")
    .select("snack_id, image_url, name, category, price, stock, min_stock")
    .eq("active", true)
    .order("category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as SnackRow[];
}

export type GameRequestRow = {
  request_id: string;
  game_name: string;
  status: string;
  vote_count: number;
  created_at: string;
};

/**
 * Most-wanted titles, for the "TOP REQUEST GAMEPOP" block on /games.
 *
 * Only still-open requests count: once staff move one to APPROVED/ADDED it has
 * left the wishlist, and REJECTED should not keep competing for attention.
 * vote_count is maintained by the sync_game_request_votes trigger.
 */
export async function getTopGameRequests(limit = 5): Promise<GameRequestRow[]> {
  const db = createClient();
  const { data, error } = await db
    .from("game_requests")
    .select("request_id, game_name, status, vote_count, created_at")
    .in("status", ["REQUESTED", "UNDER_REVIEW"])
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GameRequestRow[];
}

export async function getPromotions(): Promise<PromoRow[]> {
  const db = createClient();
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

/**
 * Bookable promo packages, each carrying the normal price it is measured against.
 *
 * `promo_offerings()` is the only source of the promo price on the customer side, and
 * it computes `normal_price` through `calculate_price()` — the same function
 * create_booking() charges with. Recomputing the saving in the browser from a rate
 * table is how a promo ends up advertised as "hemat 40rb" and then billed at the
 * full price, so the number comes from Postgres and is never derived here.
 */
export const getPromoOfferings = cache(async (): Promise<PromoOffering[]> => {
  const db = createClient();
  const { data, error } = await db.rpc("promo_offerings");
  if (error) throw new Error(error.message);
  // Drop packages that are not actually cheaper. calculate_price returns 0 when the
  // branch has no price rule for that facility type — an ACTIVE promo can name a
  // combination nobody has priced yet, and create_booking would refuse it anyway.
  // Advertising it would show "hemat Rp 0" behind a button that cannot complete.
  return ((data ?? []) as PromoOffering[]).filter(isWorthwhile);
});

export type FacilityTypeRow = {
  facility_type_id: string;
  code: string;
  name: string;
  platform: string;
  category: string;
};

export async function getFacilityTypes(): Promise<FacilityTypeRow[]> {
  const db = createClient();
  const { data, error } = await db
    .from("facility_types")
    .select("facility_type_id, code, name, platform, category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as FacilityTypeRow[];
}

/**
 * Lowest active hourly rate per facility type, across branches.
 * Used for the "Mulai RpX/Jam" chips on home & facility cards.
 */
export async function getMinHourlyRates(): Promise<Record<string, number>> {
  const db = createClient();
  const { data, error } = await db
    .from("pricing_rules")
    .select("facility_type_id, pricing_type, duration_minutes, price")
    .eq("active", true);
  if (error) throw new Error(error.message);
  const map: Record<string, number> = {};
  for (const r of data ?? []) {
    if (r.pricing_type !== "HOURLY" || !r.duration_minutes) continue;
    const perHour = (r.price / r.duration_minutes) * 60;
    if (map[r.facility_type_id] === undefined || perHour < map[r.facility_type_id]) {
      map[r.facility_type_id] = perHour;
    }
  }
  return map;
}
