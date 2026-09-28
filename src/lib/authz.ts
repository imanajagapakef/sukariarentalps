import { createClient } from "@/lib/supabase/server";

export type StaffProfile = {
  user_id: string;
  full_name: string | null;
  role: "OWNER" | "ADMIN" | "STAFF";
  active: boolean;
};

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Logged-in user with an active staff profile, or throws 401/403. */
export async function getStaffUser(allowRoles?: StaffProfile["role"][]): Promise<StaffProfile> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new AuthError("Harus login dulu", 401);

  const { data: profile } = await db
    .from("profiles")
    .select("user_id, full_name, role, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || !profile.active) throw new AuthError("Akun staff tidak ditemukan / tidak aktif", 403);
  if (allowRoles && !allowRoles.includes(profile.role)) {
    throw new AuthError(`Butuh role ${allowRoles.join("/")}, bukan ${profile.role}`, 403);
  }
  return profile as StaffProfile;
}
