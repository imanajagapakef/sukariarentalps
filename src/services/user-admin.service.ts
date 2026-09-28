import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;
export type StaffRole = Database["public"]["Enums"]["user_role"];

/**
 * Create an auth user and its staff profile. ponytail: email+password for
 * staff — the doc suggested phone OTP, but that needs Twilio money; revisit
 * at launch (Fase F) if staff complains about typing passwords.
 */
export async function createStaffUser(
  db: DB,
  input: { email: string; password: string; fullName: string; role: StaffRole },
) {
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message ?? "Gagal membuat user auth");

  const { error: profileError } = await db.from("profiles").insert({
    user_id: data.user.id,
    full_name: input.fullName,
    role: input.role,
    active: true,
  });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Error(`Profile gagal dibuat (user di-rollback): ${profileError.message}`);
  }
  return data.user.id;
}

export async function setStaffStatus(
  db: DB,
  userId: string,
  patch: { active?: boolean; role?: StaffRole },
) {
  const { error } = await db.from("profiles").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
