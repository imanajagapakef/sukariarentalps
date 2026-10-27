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
 * is *not* that cache: it only dedupes repeated calls inside a single render, which is
 * why it is safe to put in front of the live reads too — it never serves a request
 * anything older than that request's own first read.
 *
 * Only branches keep the 300 s default. Everything a booking depends on — unit status,
 * snack stock, promo eligibility — is read live, because a stale row there means the
 * customer is offered something that cannot be booked. Games are the one middle case:
 * `getGames` defaults to the 300 s cache for browsing pages, while /booking asks for
 * `revalidate: 0` because `game_availability` decides which games a branch can offer.
 */

/** Error with the failing read's name on it, so a log line says where to look. */
const fail = (scope: string, e: { message: string }) => new Error(`catalog/${scope}: ${e.message}`);

/* -------------------------------------------------------------------------- */
/*  Select lists                                                              */
/* -------------------------------------------------------------------------- */

const GAME_SCALARS =
  "game_id, image_url, name, slug, short_description, developer, publisher, release_date, age_rating";
const GAME_AVAIL = "game_availability(branch_id, available)";
const GAME_LIST = `${GAME_SCALARS}, game_platforms(platform_id), ${GAME_AVAIL}`;

const UNIT_SCALARS =
  "unit_id, image_url, name, status, condition, branch_id, facility_type_id, branches(name, short_name), facility_types(name, platform, category)";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

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

/**
 * `Omit` rather than `&`: the detail embed is a to-one object with many more fields,
 * and intersecting it with GameRow's union made `game_features` a type nothing could
 * satisfy cleanly. `publisher` / `release_date` already live on GameRow.
 */
export type GameDetailRow = Omit<GameRow, "game_features"> & {
  description: string | null;
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

export type GameRequestRow = {
  request_id: string;
  game_name: string;
  status: string;
  vote_count: number;
  created_at: string;
};

export type FacilityTypeRow = {
  facility_type_id: string;
  code: string;
  name: string;
  platform: string;
  category: string;
};

/* -------------------------------------------------------------------------- */
/*  Branches / units                                                          */
/* -------------------------------------------------------------------------- */

export const getBranches = cache(async (): Promise<BranchRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("branches")
    .select("branch_id, image_url, name, short_name, address, phone, operating_hours, google_rating, google_review_count, status")
    .eq("status", "ACTIVE")
    .order("name");
  if (error) throw fail("getBranches", error);
  return (data ?? []) as BranchRow[];
});

export const getUnitsWithFacility = cache(async (): Promise<UnitRow[]> => {
  const db = createClient();
  const { data, error } = await db.from("units").select(UNIT_SCALARS).order("branch_id").order("unit_id");
  if (error) throw fail("getUnitsWithFacility", error);
  return (data ?? []) as UnitRow[];
});

/* -------------------------------------------------------------------------- */
/*  Games                                                                     */
/* -------------------------------------------------------------------------- */

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

/**
 * Keyed on the revalidate number, not the options object: React's cache() compares
 * arguments by identity, so a fresh `{ revalidate: 0 }` literal on every call would
 * never dedupe.
 */
const gamesQuery = cache(async (revalidate: number | undefined): Promise<GameRow[]> => {
  const db = createClient(revalidate === undefined ? undefined : { revalidate });
  const { data, error } = await db
    .from("games")
    .select(`${GAME_LIST}, game_features(genre)`)
    .eq("active", true)
    .order("name");
  if (error) throw fail("getGames", error);
  return (data ?? []) as GameRow[];
});

/**
 * Game catalogue.
 *
 * `game_features.genre` rides along so the genre filter can run client-side over the
 * page's own result set. Migration 0018 backfilled genre across the catalogue, which
 * is what makes that filter worth showing.
 *
 * Defaults to the 300 s cache for browsing pages; /booking passes `revalidate: 0`
 * because `game_availability` decides which games a branch can offer.
 */
export function getGames(options?: { revalidate?: number }): Promise<GameRow[]> {
  return gamesQuery(options?.revalidate);
}

export const getPlatforms = cache(async () => {
  const db = createClient();
  const { data, error } = await db
    .from("platforms")
    .select("platform_id, name")
    .eq("active", true)
    .order("name");
  if (error) throw fail("getPlatforms", error);
  return data ?? [];
});

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
  if (error) throw fail("getGameBySlug", error);
  return (data ?? null) as GameDetailRow | null;
});

/**
 * Games to show in the "cari yang mirip" row.
 *
 * Prefers same-genre, then tops the row up from the same platform, which every game has.
 * The old version only fell back when the genre match came back completely empty, so a
 * game with a single same-genre sibling showed a one-card row. Both queries are ordered
 * by name so the row does not reshuffle between requests.
 *
 * Note: a relation may only be embedded once per select. Embedding
 * game_platforms both plainly and as !inner makes PostgREST emit a duplicate
 * FROM subquery and fail with "aggregate functions are not allowed in FROM
 * clause of their own query level". That is why the platform query uses its own
 * select list instead of GAME_LIST.
 */
export async function getSimilarGames(
  genre: string | null,
  excludeGameId: string,
  platformId?: string | null,
  limit = 6,
): Promise<GameRow[]> {
  if (!genre && !platformId) return [];
  const db = createClient();
  const picked: GameRow[] = [];

  if (genre) {
    const { data, error } = await db
      .from("games")
      .select(`${GAME_LIST}, game_features!inner(genre)`)
      .eq("active", true)
      .eq("game_features.genre", genre)
      .neq("game_id", excludeGameId)
      .order("name")
      .limit(limit);
    if (error) throw fail("getSimilarGames/genre", error);
    picked.push(...((data ?? []) as GameRow[]));
  }

  if (platformId && picked.length < limit) {
    const taken = new Set(picked.map((g) => g.game_id));
    const { data, error } = await db
      .from("games")
      .select(`${GAME_SCALARS}, game_platforms!inner(platform_id), ${GAME_AVAIL}`)
      .eq("active", true)
      .eq("game_platforms.platform_id", platformId)
      .neq("game_id", excludeGameId)
      .order("name")
      // Over-fetch by what is already taken, so de-duplicating cannot leave the row short.
      .limit(limit + taken.size);
    if (error) throw fail("getSimilarGames/platform", error);
    for (const g of (data ?? []) as GameRow[]) {
      if (picked.length >= limit) break;
      if (!taken.has(g.game_id)) picked.push(g);
    }
  }

  return picked;
}

/**
 * Most-wanted titles, for the "TOP REQUEST GAMEPOP" block on /games.
 *
 * Only still-open requests count: once staff move one to APPROVED/ADDED it has
 * left the wishlist, and REJECTED should not keep competing for attention.
 * vote_count is maintained by the sync_game_request_votes trigger.
 */
export const getTopGameRequests = cache(async (limit = 5): Promise<GameRequestRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("game_requests")
    .select("request_id, game_name, status, vote_count, created_at")
    .in("status", ["REQUESTED", "UNDER_REVIEW"])
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw fail("getTopGameRequests", error);
  return (data ?? []) as GameRequestRow[];
});

/**
 * Every game request, for staff triage on /admin/games.
 *
 * Unlike the public top-5 this keeps *all* statuses. A request moved to
 * APPROVED/REJECTED/ADDED has left the customer-facing wishlist, but staff still
 * need to see it — otherwise "hapus yang sudah selesai" is impossible and the table
 * only grows. `anon` can read this table (public read policy, migration 0002), so
 * no service client is needed here, exactly like the public list.
 */
export const getGameRequests = cache(async (limit = 100): Promise<GameRequestRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("game_requests")
    .select("request_id, game_name, status, vote_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw fail("getGameRequests", error);
  return (data ?? []) as GameRequestRow[];
});

/* -------------------------------------------------------------------------- */
/*  Snacks / promos / pricing                                                 */
/* -------------------------------------------------------------------------- */

export const getSnacks = cache(async (): Promise<SnackRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("snacks")
    .select("snack_id, image_url, name, category, price, stock, min_stock")
    .eq("active", true)
    .order("category")
    .order("name");
  if (error) throw fail("getSnacks", error);
  return (data ?? []) as SnackRow[];
});

export const getPromotions = cache(async (): Promise<PromoRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("promotions")
    .select(
      "promotion_id, name, description, status, branch_id, promotion_items(duration_minutes, price, facility_types(name))",
    )
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });
  if (error) throw fail("getPromotions", error);
  return (data ?? []) as PromoRow[];
});

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
  if (error) throw fail("getPromoOfferings", error);
  // Drop packages that are not actually cheaper. calculate_price returns 0 when the
  // branch has no price rule for that facility type — an ACTIVE promo can name a
  // combination nobody has priced yet, and create_booking would refuse it anyway.
  // Advertising it would show "hemat Rp 0" behind a button that cannot complete.
  return ((data ?? []) as PromoOffering[]).filter(isWorthwhile);
});

export const getFacilityTypes = cache(async (): Promise<FacilityTypeRow[]> => {
  const db = createClient();
  const { data, error } = await db
    .from("facility_types")
    .select("facility_type_id, code, name, platform, category")
    .order("name");
  if (error) throw fail("getFacilityTypes", error);
  return (data ?? []) as FacilityTypeRow[];
});

/**
 * Lowest active hourly rate per facility type, across branches.
 * Used for the "Mulai RpX/Jam" chips on home & facility cards.
 *
 * A rule with no duration, or a price that is not a positive number, is skipped: a
 * stray Rp 0 row would otherwise win the minimum and advertise "Mulai Rp0/jam".
 */
export const getMinHourlyRates = cache(async (): Promise<Record<string, number>> => {
  const db = createClient();
  const { data, error } = await db
    .from("pricing_rules")
    .select("facility_type_id, pricing_type, duration_minutes, price")
    .eq("active", true);
  if (error) throw fail("getMinHourlyRates", error);
  const map: Record<string, number> = {};
  for (const r of data ?? []) {
    if (r.pricing_type !== "HOURLY" || !r.duration_minutes) continue;
    const perHour = (r.price / r.duration_minutes) * 60;
    if (!Number.isFinite(perHour) || perHour <= 0) continue;
    if (map[r.facility_type_id] === undefined || perHour < map[r.facility_type_id]) {
      map[r.facility_type_id] = perHour;
    }
  }
  return map;
});