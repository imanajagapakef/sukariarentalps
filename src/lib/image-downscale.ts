/**
 * Client-side image downscale. Kept in its own module so the admin uploader and the
 * customer proof form share one implementation — and so nothing server-side ever
 * imports it by accident, since it needs `document`, `canvas` and `createImageBitmap`.
 *
 * A modern phone screenshot is 3-6 MB; re-encoded as WebP at 1600px it lands well
 * under the bucket's limit, which is what makes phone uploads viable at all.
 */
export async function downscaleImage(file: File, maxEdge = 1600): Promise<File> {
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/webp") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}