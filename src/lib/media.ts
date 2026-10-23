import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "media";

/** Kept in step with storage.buckets.allowed_mime_types (migration 0016). */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadResult = { path: string; publicUrl: string };

/**
 * Validate client-side so staff get a clear message instead of a raw storage
 * rejection. The bucket enforces the same limits server-side.
 */
export function checkImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `Format ${file.type || "tidak dikenal"} tidak didukung. Pakai JPG, PNG, WebP, atau AVIF.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Ukuran ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 5 MB.`;
  }
  return null;
}

/**
 * A short hex hash of the file's own bytes (12 chars of SHA-256, or 8 of FNV-1a
 * where crypto.subtle is unavailable), so two different pictures can never land on
 * the same object key even when they share a filename.
 *
 * This is load-bearing, not decoration. Staff upload files named `cover.svg` and
 * `item.svg` — that is every cover in the catalogue — so a filename-only key plus
 * `upsert` meant replacing an image reused the exact same key and returned the
 * exact same public URL. The admin table infers "has this row changed?" by
 * comparing that URL to the stored one, so an image-only edit was never dirty and
 * Simpan stayed disabled until some unrelated column was touched. The bucket also
 * serves with a one-year cacheControl, so the replacement would have kept serving
 * the old picture to customers regardless.
 *
 * Re-uploading the identical file still hashes to the same name, so that stays
 * idempotent and does not leave orphans in the bucket.
 */
async function contentHash(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .slice(0, 6)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // crypto.subtle is unavailable outside a secure context, which a LAN-IP install
  // over plain http is. FNV-1a is not a security primitive and is not used as one
  // here — it only has to tell two different files apart.
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Slugified original name plus a content hash, so `cover.svg` is never ambiguous. */
async function objectName(file: File): Promise<string> {
  const base = (file.name || "image")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${base}-${await contentHash(file)}.${ext}`;
}

export async function mediaPath(entity: string, id: string, file: File): Promise<string> {
  return `${entity}/${id}/${await objectName(file)}`;
}

/**
 * Upload to the public `media` bucket and return its public URL.
 *
 * upsert: re-uploading the same filename replaces it, so an updated cover keeps
 * the same key and the old file does not accumulate in the bucket. Paths are
 * namespaced by entity and row id, so a row's assets are easy to list.
 */
export async function uploadImage(
  db: SupabaseClient,
  entity: string,
  id: string,
  file: File,
): Promise<UploadResult> {
  const problem = checkImageFile(file);
  if (problem) throw new Error(problem);

  const path = await mediaPath(entity, id, file);
  const { error } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error(`Upload gagal: ${error.message}`);

  const { data } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Bucket tidak mengembalikan URL publik");
  return { path, publicUrl: data.publicUrl };
}

/** Remove an object previously written by uploadImage. */
export async function deleteImage(db: SupabaseClient, path: string): Promise<void> {
  if (!path.startsWith(`${MEDIA_BUCKET}/`)) {
    // getPublicUrl yields a full URL; trim it back to the bucket-relative key.
    const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    const at = path.indexOf(marker);
    if (at < 0) return;
    path = path.slice(at + marker.length);
  }
  const { error } = await db.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw new Error(`Hapus gagal: ${error.message}`);
}

/**
 * The object a save has just orphaned, or "" when the save is not a removal.
 *
 * Deciding this from the payload, and acting on it only after the row is written,
 * is what keeps the database and the bucket in step. Deleting the file first
 * leaves `image_url` pointing at an object that no longer exists whenever the save
 * does not land — staff clears the cover, navigates away, or the request fails —
 * and that renders as a broken cover on the admin screen and the public page
 * alike, while every "cover ada" count still reads it as present.
 *
 * Pure, so the ordering that matters can be asserted without a browser.
 */
export function orphanedImageUrl(payload: unknown, previous: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  // Only an explicit null clears the column. An absent key means the save never
  // touched image_url, so nothing is orphaned.
  const next = (payload as { image_url?: unknown }).image_url;
  if (next !== null) return "";
  if (typeof previous !== "string" || previous === "") return "";
  return previous;
}
