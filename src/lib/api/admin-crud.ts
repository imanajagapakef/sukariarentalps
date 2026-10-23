import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import type { Database } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, AuthError, type StaffProfile } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";

type Table = keyof Database["public"]["Tables"];

/**
 * Guarded CRUD for admin catalog tables. Reads stay in server components via
 * anon client (RLS public read); only writes route through here because RLS
 * denies catalog writes for authenticated — the service_role client is the
 * sanctioned door, and this helper is the lock.
 */
/** Every adminCrud schema is a z.object(...) — it carries .partial() at runtime. */
type CrudSchema = z.ZodTypeAny & { partial(): z.ZodTypeAny };

/**
 * Runs before the UPDATE and returns the body actually written.
 *
 * Exists for `snacks.stock`, which must not be written directly: the
 * `inventory_movements` BEFORE INSERT trigger owns that column, so a hand
 * correction has to be expressed as an ADJUSTMENT movement or the ledger lies.
 * The hook gets the current row so it can compute the delta.
 */
type BeforeWrite = (ctx: {
  db: ReturnType<typeof createAdminClient>;
  profile: StaffProfile;
  id: string;
  before: Record<string, unknown>;
  body: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;

export function adminCrud(
  table: Table,
  schema: CrudSchema,
  allowRoles?: StaffProfile["role"][],
  beforeWrite?: BeforeWrite,
) {
  async function staff() {
    const profile = await getStaffUser(allowRoles);
    return { db: createAdminClient(), profile };
  }

  async function POST(req: NextRequest) {
    try {
      const { db, profile } = await staff();
      const body = schema.parse(await req.json().catch(() => null));
      const { data, error } = await db.from(table).insert(body).select().single();
      if (error) throw new AuthError(error.message, 500);
      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "create",
        entityType: table,
        entityId: String(Object.values(data)[0]),
        after: data as never,
      });
      return NextResponse.json({ row: data }, { status: 201 });
    } catch (e) {
      return handleRouteError(e);
    }
  }

  async function PATCH(req: NextRequest) {
    try {
      const { db, profile } = await staff();
      const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!raw || typeof raw.id !== "string") return jsonError("id wajib diisi", 400);
      const id = raw.id;
      delete raw.id;
      const body = schema.partial().parse(raw);
      // The PK is the WHERE clause, never a writable column. The base schema keeps it
      // required for POST (the insert needs it), so partial() must not let a stray
      // "snack_id"/"game_id"/"pricing_id" in a PATCH payload rewrite the row's key.
      // Mutate through a Record alias: the zod type has no index signature for the
      // dynamic key, while .update() below keeps the exact parsed type.
      const strip = body as unknown as Record<string, unknown>;
      delete strip[pkOf(table)];
      const { data: before } = await db.from(table).select("*").eq(pkOf(table), id).maybeSingle();
      if (!before) return jsonError("Data tidak ditemukan", 404);
      // The hook may consume fields from the body (snacks.stock) and apply them
      // through their own path, so it returns the body that is actually written.
      const patch = beforeWrite
        ? await beforeWrite({ db, profile, id, before: before as Record<string, unknown>, body })
        : body;

      let after;
      if (Object.keys(patch).length > 0) {
        const { data, error } = await db.from(table).update(patch).eq(pkOf(table), id).select().single();
        if (error) throw new AuthError(error.message, 500);
        after = data;
      } else if (beforeWrite) {
        // The hook consumed the whole body and already applied the change through
        // its own path (snacks.stock -> an ADJUSTMENT movement). That is a success,
        // not a no-op — returning 400 here told the caller a correction had failed
        // when it had in fact been recorded. Re-read the row so the response and the
        // audit entry still show the post-change state.
        const { data } = await db.from(table).select("*").eq(pkOf(table), id).single();
        after = data;
      } else {
        return jsonError("Tidak ada field yang diubah", 400);
      }

      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "update",
        entityType: table,
        entityId: id,
        before: before as never,
        after: after as never,
      });
      return NextResponse.json({ row: after });
    } catch (e) {
      return handleRouteError(e);
    }
  }

  async function DELETE(req: NextRequest) {
    try {
      const { db, profile } = await staff();
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return jsonError("id query wajib diisi", 400);
      // soft-disable where the schema has a flag; hard delete otherwise
      const { data: row } = await db.from(table).select("*").eq(pkOf(table), id).maybeSingle();
      if (!row) return jsonError("Data tidak ditemukan", 404);
      if ("active" in row) {
        await db.from(table).update({ active: false } as never).eq(pkOf(table), id);
      } else {
        const { error } = await db.from(table).delete().eq(pkOf(table), id);
        if (error) throw new AuthError(error.message, 500);
      }
      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "deactivate",
        entityType: table,
        entityId: id,
        before: row as never,
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return handleRouteError(e);
    }
  }

  return { POST, PATCH, DELETE };
}

const PK: Partial<Record<Table, string>> = {
  snacks: "snack_id",
  games: "game_id",
  pricing_rules: "pricing_id",
  promotions: "promotion_id",
  booking_config: "config_id",
  units: "unit_id",
  branches: "branch_id",
  facility_types: "facility_type_id",
};

function pkOf(table: Table): string {
  return PK[table] ?? `${table.replace(/s$/, "")}_id`;
}
