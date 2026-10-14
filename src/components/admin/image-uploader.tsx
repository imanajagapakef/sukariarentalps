"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteImage, uploadImage } from "@/lib/media";
import { downscaleImage } from "@/lib/image-downscale";
import { Button } from "@/components/ui/button";

/**
 * Upload one image for one row: file -> public `media` bucket -> public URL.
 *
 * The URL is handed back through `onChange` and lands in the row's image_url
 * column when the caller saves it, so this is the same shape as any other
 * edited column. Object paths are namespaced `{entity}/{id}/{file}` so a row's
 * assets are easy to list and replacing a file overwrites in place.
 */
export function ImageUploader({
  entity,
  rowId,
  value,
  onChange,
  label,
}: {
  entity: string;
  rowId: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  label?: string;
}) {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const optimized = await downscaleImage(file);
      const { publicUrl } = await uploadImage(db, entity, rowId, optimized);
      onChange(publicUrl);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      if (value) await deleteImage(db, value);
      onChange("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hapus gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview; the bucket is public
          <img src={value} alt={label ?? ""} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon aria-hidden className="size-4 text-muted-foreground" />
        )}
      </span>

      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary/60">
        <Upload aria-hidden className="size-3.5" />
        {busy ? "Proses…" : "Pilih"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void upload(f);
          }}
        />
      </label>

      {value && (
        <Button type="button" size="icon-xs" variant="ghost" disabled={busy} onClick={() => void remove()} aria-label="Hapus gambar">
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
