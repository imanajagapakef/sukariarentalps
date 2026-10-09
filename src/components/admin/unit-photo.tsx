"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader } from "@/components/admin/image-uploader";

/**
 * Unit photo control for the admin units grid.
 *
 * ImageUploader only hands back the public URL; persisting it is this wrapper's
 * job, so the card is one-click rather than upload-then-remember-to-save.
 */
export function UnitPhoto({
  unitId,
  imageUrl,
  name,
  compact = false,
}: {
  unitId: string;
  imageUrl: string | null;
  name: string;
  /** Inside the /admin/units table the column header already says "Foto", and the
   *  divider + label doubled every row's height. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(imageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(url: string) {
    setValue(url);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/units", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: unitId, image_url: url || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Gagal (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
      setValue(imageUrl); // roll the preview back, the row did not change
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "mt-3 border-t border-border pt-3"}>
      {!compact && (
        <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Foto unit</p>
      )}
      <ImageUploader
        entity="units"
        rowId={unitId}
        value={value}
        onChange={(url) => void persist(url)}
        label={name}
      />
      {busy && <p className="mt-1 text-xs text-muted-foreground">Menyimpan…</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
