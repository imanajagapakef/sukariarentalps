import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { uploadImage } from "@/lib/media";

/**
 * Poster upload.
 *
 * A row id is not always known yet — a brand new tournament has none until it is saved —
 * so the storage path is keyed by a random token in that case. Either way the browser
 * only ever receives a URL; it never picks the path itself.
 */
export async function POST(request: NextRequest) {
  try {
    // Poster upload belongs to tournament authoring (create/edit), which is an
    // OWNER/ADMIN surface — the cashier actions never touch assets.
    await getStaffUser(["OWNER", "ADMIN"]);

    const form = await request.formData();
    const file = form.get("poster");
    if (!(file instanceof File)) return jsonError("File poster wajib diunggah", 400);
    if (file.size === 0) return jsonError("File poster kosong", 400);

    const db = createAdminClient();
    const id = (form.get("tournament_id") as string | null) ?? `new-${Date.now().toString(36)}`;
    const { publicUrl } = await uploadImage(db, "tournaments", id, file);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    return handleRouteError(error);
  }
}