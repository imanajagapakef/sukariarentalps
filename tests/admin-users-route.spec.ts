import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PATCH } from "@/app/api/admin/users/[id]/route";
import {
  authUserExists,
  callRoute,
  canAuthenticate,
  errorMessage,
  isBanned,
  profileOf,
  signInAsOwner,
  signOut,
  type SignedIn,
} from "./admin-harness";
import { createAdminClient } from "@/lib/supabase/admin";

const describeLive = canAuthenticate ? describe : describe.skip;

/**
 * PATCH /api/admin/users/[id] — role change and activate/deactivate.
 *
 * This file exists because of the bug it pins: "Nonaktif" called
 * `auth.admin.deleteUser()`, destroying the account while reporting success, and
 * nothing could catch it. The route layer had no test at all, so a 500-on-every-search
 * and a delete-instead-of-deactivate both shipped green.
 */
describeLive("admin users route", () => {
  const suffix = Date.now().toString(36);
  const email = `route.test.${suffix}@sukariarental.test`;
  const password = "routeharness12345";
  let owner: SignedIn;
  let targetId: string;

  beforeAll(async () => {
    owner = await signInAsOwner();

    const db = createAdminClient();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`gagal membuat user test: ${error?.message}`);
    targetId = data.user.id;

    // Checked, because a silent failure here produced a baffling 404 two tests later:
    // profiles.user_id has an FK to auth.users, so a bad row just vanishes.
    const { error: profileError } = await db.from("profiles").insert({
      user_id: targetId,
      full_name: "Route Test",
      role: "STAFF",
      active: true,
    });
    if (profileError) throw new Error(`gagal membuat profile test: ${profileError.message}`);
  });

  afterAll(async () => {
    if (!targetId) return;
    const db = createAdminClient();
    await db.from("audit_logs").delete().eq("entity_id", targetId);
    await db.from("profiles").delete().eq("user_id", targetId);
    await db.auth.admin.deleteUser(targetId).catch(() => null);
    signOut();
  });

  const patch = (id: string, body: unknown) =>
    callRoute(PATCH, { params: Promise.resolve({ id }) }, { method: "PATCH", body });

  it("rejects a request with no session", async () => {
    signOut();
    const result = await patch(targetId, { active: false });
    expect(result.status).toBe(401);
  });

  it("changes a role", async () => {
    signOut();
    await signInAsOwner();
    const result = await patch(targetId, { role: "ADMIN" });
    expect(result.status).toBe(200);
    expect((await profileOf(targetId))?.role).toBe("ADMIN");
  });

  it("deactivates by banning, not by deleting the account", async () => {
    signOut();
    await signInAsOwner();
    const result = await patch(targetId, { active: false });
    expect(result.status).toBe(200);

    expect((await profileOf(targetId))?.active).toBe(false);
    // The regression: this row used to be destroyed, taking the email with it.
    expect(await authUserExists(targetId)).toBe(true);
    expect(await isBanned(targetId)).toBe(true);
  });

  it("reactivates an account, which the old delete made impossible", async () => {
    signOut();
    await signInAsOwner();
    const result = await patch(targetId, { active: true });
    expect(result.status).toBe(200);

    expect((await profileOf(targetId))?.active).toBe(true);
    expect(await isBanned(targetId)).toBe(false);
    expect(await authUserExists(targetId)).toBe(true);
  });

  it("refuses privilege escalation to OWNER", async () => {
    const result = await patch(targetId, { role: "OWNER" });
    expect(result.status).toBe(400);
    expect((await profileOf(targetId))?.role).not.toBe("OWNER");
  });

  it("refuses to modify the acting account", async () => {
    const result = await patch(owner.userId, { active: false });
    expect(result.status).toBe(400);
    expect(errorMessage(result)).toMatch(/akun sendiri/i);
    expect((await profileOf(owner.userId))?.active).toBe(true);
  });

  // The route's `target.role === "OWNER"` guard is deliberately NOT tested here. There
  // is exactly one owner and it is always the acting user, so the self-guard above
  // fires first and the OWNER branch is unreachable. Exercising it would mean creating
  // a second real auth user, promoting it to OWNER, and leaving a live privileged
  // account with a known password behind if the run ever crashed. Not worth it for a
  // branch that is defence in depth.

  it("404s an unknown user instead of reporting success", async () => {
    const result = await patch(randomUUID(), { active: false });
    expect(result.status).toBe(404);
  });

  it("rejects a malformed payload", async () => {
    expect((await patch(targetId, { role: "SUPERUSER" })).status).toBe(400);
    expect((await patch(targetId, { active: "yes" })).status).toBe(400);
  });

  it("writes an audit row naming the actor and the change", async () => {
    const db = createAdminClient();
    const { data } = await db
      .from("audit_logs")
      .select("actor_id, action, entity_id, after_data")
      .eq("entity_id", targetId)
      .order("id", { ascending: false })
      .limit(1);

    expect(data?.[0]).toMatchObject({
      actor_id: owner.userId,
      action: "staff_update",
      entity_id: targetId,
    });
  });
});
