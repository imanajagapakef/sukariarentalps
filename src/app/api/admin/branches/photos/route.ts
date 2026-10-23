import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { branchPhotoPatchSchema, branchPhotoSchema } from "@/lib/validations/admin";
import { deleteImage } from "@/lib/media";
import { revalidatePublicMedia } from "@/lib/revalidate";
import type { Database } from "@/types/database";

/**
 * Branch photo gallery (migration 0026).
 *
 * OWNER/ADMIN only, matching the other master-data routes: a branch is a
 * location that appears on the public site, not a counter staff work at.
 *
 * The 8-photo cap lives in a database trigger so no caller can route around it;
 * this route reads the same number only to hand back a clear 400 instead of the
 * trigger's error, and to tell the client the gallery is full.
 *
 * Ordering is `position`, lowest first, and the first photo is the hero the
 * customer-facing branch page renders. Append and promote are therefore the whole
 * of the ordering story:
 *   POST          -> position = max + 1  (lands at the end)
 *   PATCH primary -> position = min - 1  (jumps to the front, no renumbering)
 */

/** OWNER/ADMIN, matching /admin/units and the other master-data surfaces. */
async function admin() {
  const profile = await getStaffUser(["OWNER", "ADMIN"]);
  return { db: createAdminClient(), profile };
}

export async function POST(request: NextRequest) {
  try {
    const { db, profile } = await admin();
    const parsed = branchPhotoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);
    const { branch_id, image_url, caption } = parsed.data;

    const { data: branch } = await db
      .from("branches")
      .select("branch_id")
      .eq("branch_id", branch_id)
      .maybeSingle();
    if (!branch) return jsonError("Cabang tidak ditemukan", 404);

    // Appending rather than prepending: a freshly uploaded photo is a new angle on
    // the branch, not automatically the one that should head the page. Staff who do
    // want it first press "Jadikan utama".
    const { data: last } = await db
      .from("branch_photos")
      .select("position")
      .eq("branch_id", branch_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await db
      .from("branch_photos")
      .insert({ branch_id, image_url, caption: caption ?? null, position: (last?.position ?? 0) + 1 })
      .select()
      .single();
    if (error) {
      // The trigger's cap, surfaced as the 400 the admin UI expects rather than a 500.
      if (error.code === "22023") return jsonError(error.message, 400, "PHOTO_LIMIT");
      throw new Error(error.message);
    }

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "create",
      entityType: "branch_photos",
      entityId: String(data.photo_id),
      after: data as never,
    });

    revalidatePublicMedia();
    return NextResponse.json({ photo: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { db, profile } = await admin();
    const parsed = branchPhotoPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);
    const { id, caption, make_primary } = parsed.data;

    const { data: before } = await db.from("branch_photos").select("*").eq("photo_id", id).maybeSingle();
    if (!before) return jsonError("Foto tidak ditemukan", 404);

    const patch: Database["public"]["Tables"]["branch_photos"]["Update"] = {};
    if (caption !== undefined) patch.caption = caption;

    if (make_primary) {
      // Below the current minimum, so it becomes the cover without renumbering the
      // gallery — which would mean rewriting a row per sibling on every promotion.
      const { data: first } = await db
        .from("branch_photos")
        .select("position")
        .eq("branch_id", before.branch_id)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      patch.position = (first?.position ?? 0) - 1;
    }

    if (Object.keys(patch).length === 0) return jsonError("Tidak ada field yang diubah", 400);

    const { data, error } = await db
      .from("branch_photos")
      .update(patch)
      .eq("photo_id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "update",
      entityType: "branch_photos",
      entityId: String(id),
      before: before as never,
      after: data as never,
    });

    revalidatePublicMedia();
    return NextResponse.json({ photo: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db, profile } = await admin();
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return jsonError("id query wajib diisi", 400);

    const { data: before } = await db.from("branch_photos").select("*").eq("photo_id", id).maybeSingle();
    if (!before) return jsonError("Foto tidak ditemukan", 404);

    // Row first, object second. Deleting the file first would leave any page that
    // still lists this photo rendering a broken image if the delete failed or the
    // response was lost — the dangling-reference bug that hit game covers.
    const { error } = await db.from("branch_photos").delete().eq("photo_id", id);
    if (error) throw new Error(error.message);

    // The row is gone and nothing references the file any more, so a failure here
    // only leaves an unreferenced object behind. Swallowed rather than surfaced:
    // the staff asked for a photo to be removed, and it was.
    await deleteImage(db, before.image_url).catch(() => {});

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "delete",
      entityType: "branch_photos",
      entityId: String(id),
      before: before as never,
    });

    // Must come after the object is gone: the cached row points at a URL that no
    // longer exists, so dropping the cache is the only thing that stops the branch
    // page rendering a broken image for the rest of its 300 s window.
    revalidatePublicMedia();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}