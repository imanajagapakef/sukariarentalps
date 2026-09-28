import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Json } from "@/types/database";

type DB = SupabaseClient<Database>;

/** Append-only activity trail; read by OWNER/ADMIN via audit_logs RLS. */
export async function audit(
  db: DB,
  entry: {
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    before?: Json | null;
    after?: Json | null;
  },
) {
  const { error } = await db.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_role: entry.actorRole as Database["public"]["Enums"]["user_role"],
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    reason: entry.reason ?? null,
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
  });
  // Audit failure shouldn't undo a legitimate action, but must stay visible.
  if (error) console.error("audit_log insert failed:", error.message);
}
