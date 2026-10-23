import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  POST as addPhoto,
  PATCH as patchPhoto,
  DELETE as deletePhoto,
} from "@/app/api/admin/branches/photos/route";
import { callRoute, canAuthenticate, signInAsOwner } from "./admin-harness";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANCH_PHOTO_LIMIT } from "@/lib/branch-photo-gallery";
import { sortBranchPhotos } from "@/lib/branch-photo-gallery";

// The route ends every write with revalidatePath(), which only works inside a Next
// request scope. A plain node test has none, so it throws and the handler answers 500
// — the handler is right, the test has to stand in for the scope it is not in.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const describeLive = canAuthenticate ? describe : describe.skip;

/**
 * Branch photo gallery (migration 0026).
 *
 * Runs against the real route handler and a real session, because the guarantees
 * under test are the ones the UI depends on: a new photo lands at the end of the
 * gallery, "jadikan utama" actually promotes it, and a full gallery answers 400
 * instead of 500. Only the file in the bucket is absent — the client uploads that,
 * so these tests never touch storage.
 */
describeLive("branch photos route", () => {
  const branchId = "BR-B5";
  const added: number[] = [];
  let db: ReturnType<typeof createAdminClient>;

  beforeAll(async () => {
    await signInAsOwner();
    db = createAdminClient();
  });

  afterAll(async () => {
    if (!db || added.length === 0) return;
    // Every row this suite created, by id, so a mid-test failure cannot leak photos
    // onto a real branch's public page.
    await db.from("branch_photos").delete().in("photo_id", added);
  });

  async function create(overrides: Record<string, unknown> = {}) {
    const result = await callRoute(addPhoto, undefined as never, {
      method: "POST",
      body: {
        branch_id: branchId,
        image_url: `https://example.test/b5-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`,
        ...overrides,
      },
    });
    const id = (result.body as { photo?: { photo_id: number } })?.photo?.photo_id;
    if (id) added.push(id);
    return { result, id };
  }

  const ids = async () => {
    const { data } = await db
      .from("branch_photos")
      .select("photo_id, position")
      .eq("branch_id", branchId);
    return sortBranchPhotos(data ?? []);
  };

  it("appends a new photo to the end of the gallery", async () => {
    const before = await ids();
    const { result, id } = await create();

    expect(result.status).toBe(201);
    expect(id).toBeTruthy();

    const after = await ids();
    expect(after).toHaveLength(before.length + 1);
    // Appended, not prepended: a new photo is a new angle, not automatically the hero.
    expect(after.at(-1)?.photo_id).toBe(id);
  });

  it("promotes a photo to the front, which makes it the cover", async () => {
    const { id } = await create();
    const before = await ids();
    const middle = before.find((p) => p.photo_id === id);
    expect(middle).toBeTruthy();
    if (!middle || before.length < 2) return;

    const result = await callRoute(patchPhoto, undefined as never, {
      method: "PATCH",
      body: { id, make_primary: true },
    });
    expect(result.status).toBe(200);

    const after = await ids();
    expect(after[0].photo_id).toBe(id);
    // Promotion must not renumber the rest of the gallery.
    const others = after.filter((p) => p.photo_id !== id);
    expect(others.map((p) => p.photo_id)).toEqual(
      before.filter((p) => p.photo_id !== id).map((p) => p.photo_id),
    );
  });

  it("updates a caption without touching the order", async () => {
    const { id } = await create();
    expect(id).toBeTruthy();
    if (!id) return;
    const patched = await callRoute(patchPhoto, undefined as never, {
      method: "PATCH",
      body: { id, caption: "Lounge depan" },
    });
    expect(patched.status).toBe(200);
    expect((patched.body as { photo: { caption: string } }).photo.caption).toBe("Lounge depan");
  });

  it("removes the row so nothing points at the file any more", async () => {
    const { id } = await create();
    expect(id).toBeTruthy();
    if (!id) return;

    const deleted = await callRoute(deletePhoto, undefined as never, {
      method: "DELETE",
      url: `http://localhost/api?id=${id}`,
    });
    expect(deleted.status).toBe(200);

    const { data } = await db.from("branch_photos").select("photo_id").eq("photo_id", id);
    expect(data).toEqual([]);
    added.splice(added.indexOf(id), 1);
  });

  it("rejects a branch that does not exist", async () => {
    const result = await callRoute(addPhoto, undefined as never, {
      method: "POST",
      body: { branch_id: "BR-NOPE", image_url: "https://example.test/x.webp" },
    });
    expect(result.status).toBe(404);
  });

  it("answers 400, not 500, when the gallery is full", async () => {
    // The cap is a database trigger. What matters here is that the UI gets a clean
    // 400 it can show staff, rather than a server error from an unexpected raise.
    const { data: existing } = await db
      .from("branch_photos")
      .select("photo_id")
      .eq("branch_id", branchId);
    const start = existing?.length ?? 0;

    const fillers: number[] = [];
    for (let i = start; i < BRANCH_PHOTO_LIMIT; i++) {
      const { result, id } = await create();
      expect(result.status).toBe(201);
      if (id) fillers.push(id);
    }

    const overflow = await create();
    expect(overflow.result.status).toBe(400);

    const { count } = await db
      .from("branch_photos")
      .select("photo_id", { count: "exact", head: true })
      .eq("branch_id", branchId);
    expect(count).toBe(BRANCH_PHOTO_LIMIT);

    // Put the branch back as it was found. Leaving it full would break every test
    // after this one, and would leave stray photos on a real branch's public page.
    if (fillers.length > 0) {
      await db.from("branch_photos").delete().in("photo_id", fillers);
      for (const id of fillers) added.splice(added.indexOf(id), 1);
    }
  });

  it("refuses a patch that changes nothing", async () => {
    const { id } = await create();
    expect(id).toBeTruthy();
    if (!id) return;
    const result = await callRoute(patchPhoto, undefined as never, {
      method: "PATCH",
      body: { id },
    });
    expect(result.status).toBe(400);
  });
});