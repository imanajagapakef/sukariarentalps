"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/admin/image-uploader";
import { canAddPhoto, sortBranchPhotos, BRANCH_PHOTO_LIMIT, type BranchPhoto } from "@/lib/branch-photo-gallery";

/**
 * Photo gallery editor for one branch, on /admin/branches.
 *
 * The first photo in the array is the branch's cover: the customer-facing branch
 * page takes its hero from it. Rather than a separate "set as cover" flag that
 * could disagree with the order, "Jadikan utama" moves a photo to the front and
 * that photo wins.
 *
 * Upload and delete both go through the API route, which owns ordering and the
 * 8-photo cap. Deleting is the row-then-object order for the same reason as the
 * game covers: a file removed while the row still points at it breaks every page
 * that lists the photo.
 */
export function BranchPhotoGallery({ branchId, photos }: { branchId: string; photos: BranchPhoto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = !canAddPhoto(photos.length);

  // The rows arrive already ordered by the server; re-sorting is cheap and keeps the
  // "Utama" badge on the same photo the public page would use as the hero.
  const ordered = sortBranchPhotos(photos);

  async function call(method: string, body?: unknown, query = "") {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/branches/photos${query}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  /** ImageUploader has already put the file in the bucket; this records the row. */
  function attach(image_url: string) {
    void call("POST", { branch_id: branchId, image_url });
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg uppercase">Foto Cabang</h3>
          <p className="text-sm text-muted-foreground">
            {full
              ? `Galeri penuh (${BRANCH_PHOTO_LIMIT} foto). Hapus satu untuk menambah.`
              : `${photos.length} dari ${BRANCH_PHOTO_LIMIT} foto. Foto pertama dipakai sebagai gambar besar halaman cabang.`}
          </p>
        </div>
        {/* Rendered with a null value, so the uploader shows only its "Pilih"
            button — an existing photo is removed with its own control below. */}
        {!full && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
            <ImageUploader
              entity="branches"
              rowId={branchId}
              value={null}
              onChange={(url) => url && attach(url)}
              label="Tambah foto cabang"
            />
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {ordered.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Belum ada foto. Halaman cabang akan memakai foto unit sampai foto pertama diunggah.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ordered.map((p, index) => (
            <li key={p.photo_id} className="flex flex-col gap-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview; the bucket is public */}
                <img src={p.image_url} alt={p.caption ?? `Foto ${index + 1}`} className="h-full w-full object-cover" />
                {index === 0 && (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                    <Star aria-hidden className="size-2.5" /> Utama
                  </span>
                )}
              </div>

              <div className="flex gap-1">
                {index !== 0 && (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    className="flex-1"
                    onClick={() => void call("PATCH", { id: p.photo_id, make_primary: true })}
                  >
                    Jadikan utama
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy}
                  aria-label={`Hapus foto ${index + 1}`}
                  onClick={() => void call("DELETE", undefined, `?id=${p.photo_id}`)}
                >
                  <Trash2 aria-hidden className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}