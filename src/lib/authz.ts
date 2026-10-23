import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type StaffProfile = {
  user_id: string;
  full_name: string | null;
  role: "OWNER" | "ADMIN" | "STAFF";
  active: boolean;
  branch_id: string | null;
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
const fetchStaffProfile = cache(async (): Promise<StaffProfile> => {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new AuthError("Harus login dulu", 401);

  const { data: profile } = await db
    .from("profiles")
    .select("user_id, full_name, role, active, branch_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || !profile.active) throw new AuthError("Akun staff tidak ditemukan / tidak aktif", 403);
  return profile as StaffProfile;
});

export async function getStaffUser(allowRoles?: StaffProfile["role"][]): Promise<StaffProfile> {
  const profile = await fetchStaffProfile();
  if (allowRoles && !allowRoles.includes(profile.role)) {
    throw new AuthError(`Butuh role ${allowRoles.join("/")}, bukan ${profile.role}`, 403);
  }
  return profile;
}

/**
 * STAFF may touch only rows of their own branch; OWNER/ADMIN are unbound and
 * answer for every outlet. Call it as soon as the target row is fetched —
 * passing before the scope check would leak a 404-shaped oracle for other
 * branches' data.
 */
export function assertBranchScope(
  profile: StaffProfile,
  targetBranchId: string | null | undefined,
): void {
  if (profile.role === "STAFF" && targetBranchId !== profile.branch_id) {
    throw new AuthError("Anda hanya boleh mengakses data cabang sendiri", 403);
  }
}
