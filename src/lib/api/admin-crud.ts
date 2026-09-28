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

export function adminCrud(table: Table, schema: CrudSchema, allowRoles?: StaffProfile["role"][]) {
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
      if (Object.keys(body).length === 0) return jsonError("Tidak ada field yang diubah", 400);
      const { data: before } = await db.from(table).select("*").eq(pkOf(table), id).maybeSingle();
      if (!before) return jsonError("Data tidak ditemukan", 404);
      const { data, error } = await db.from(table).update(body).eq(pkOf(table), id).select().single();
      if (error) throw new AuthError(error.message, 500);
      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "update",
        entityType: table,
        entityId: id,
        before: before as never,
        after: data as never,
      });
      return NextResponse.json({ row: data });
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
