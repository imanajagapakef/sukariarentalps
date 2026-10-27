"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/media";
import { downscaleImage } from "@/lib/image-downscale";
import { Button } from "@/components/ui/button";

/**
 * Upload one image for one row: file -> public `media` bucket -> public URL.
 *
 * The URL is handed back through `onChange` and lands in the row's image_url
 * column when the caller saves it, so this is the same shape as any other
 * edited column. Object paths are namespaced `{entity}/{id}/{file}` so a row's
 * assets are easy to list and replacing a file overwrites in place.
 *
 * Clearing an image only reports `null` — it never deletes the object itself.
 * The caller owns the save, so the caller owns the delete, and it can run it
 * after the row is written. Doing it here was a genuine data-integrity bug: the
 * file went away immediately, so any save that did not land left image_url
 * pointing at a missing object. See `orphanedImageUrl`.
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
  onChange: (url: string | null) => void;
  label?: string;
}) {
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
      // No router.refresh() here: this component never writes the row, so there is
      // nothing new to re-read. Refreshing anyway re-rendered the whole page mid-edit
      // and made it look like the change had already been saved. The caller persists
      // the URL and refreshes when it is actually written.
      onChange(publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    onChange(null);
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

      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs transition-colors hover:border-primary/60">
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
        <Button type="button" size="icon-xs" variant="ghost" disabled={busy} onClick={remove} aria-label="Hapus gambar">
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
