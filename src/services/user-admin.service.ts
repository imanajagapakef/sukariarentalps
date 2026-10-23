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
  input: { email: string; password: string; fullName: string; role: StaffRole; branchId: string | null },
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
    branch_id: input.branchId,
  });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    throw new Error(`Profile gagal dibuat (user di-rollback): ${profileError.message}`);
  }
  return data.user.id;
}

/**
 * Change a staff member's role, or activate/deactivate them.
 *
 * Deactivation is a **ban, not a delete**. This used to call
 * `auth.admin.deleteUser()`, which destroys the auth identity — the email, and the
 * link between a person and every audit row they ever touched — and makes the
 * account impossible to bring back, so "Nonaktif" was a one-way button that reported
 * success. A ban blocks sign-in while keeping the row, and `ban_duration: "none"`
 * reverses it.
 *
 * The profile is updated first on purpose. `getStaffUser()` refuses any profile with
 * `active = false`, so if the ban then fails the app is still locked out and only the
 * unused auth row survives — the fail-safe direction. The error is not swallowed: a
 * silently-ignored failure here looks identical to a successful deactivation.
 */
export async function setStaffStatus(
  db: DB,
  userId: string,
  patch: { active?: boolean; role?: StaffRole; branch_id?: string },
) {
  const { error } = await db.from("profiles").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (patch.active === false) {
    // ~100 years. Effectively permanent to staff, reversible by an owner.
    const { error: banError } = await db.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    if (banError) throw new Error(`Profil nonaktif, tapi login tidak dikunci: ${banError.message}`);
  } else if (patch.active === true) {
    const { error: unbanError } = await db.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
    if (unbanError) throw new Error(`Profil aktif, tapi login masih terkunci: ${unbanError.message}`);
  }
}
