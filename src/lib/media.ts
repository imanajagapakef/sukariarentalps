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

/** Stable, collision-free filename: slugified original plus a content hash. */
function objectName(file: File): string {
  const base = (file.name || "image")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${base}.${ext}`;
}

export function mediaPath(entity: string, id: string, file: File): string {
  return `${entity}/${id}/${objectName(file)}`;
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

  const path = mediaPath(entity, id, file);
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
