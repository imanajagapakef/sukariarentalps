"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/admin/image-uploader";
import { SelectField } from "@/components/ui/select-field";
import { isRowDirty, normalizeCell, pageWindow, paginate, withSaved } from "@/lib/table-edit-state";
import { deleteImage, orphanedImageUrl } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";

export type Column = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "bool" | "image" | "date";
  options?: { value: string; label: string }[];
  required?: boolean;
};

type Row = Record<string, unknown>;

/**
 * Thin client over the adminCrud API (POST/PATCH/DELETE {id}).
 * One component covers snacks/games/pricing — no per-table boilerplate.
 *
 * Columns of type "image" render an uploader instead of a text input. The file
 * goes to the public `media` bucket and the row's image_url column is set to the
 * resulting public URL, so the customer-facing Cover component picks it up with
 * no further wiring. `mediaPrefix` names the bucket namespace, e.g. "games".
 *
 * `edits` is an optimistic overlay and deliberately outlives the save that
 * produced it; `saved` records what each row was last confirmed to hold so Simpan
 * still greys out immediately. See @/lib/table-edit-state.
 */
export function TableEditor({
  endpoint,
  idKey,
  columns,
  rows,
  readOnly = false,
  mediaPrefix,
  pageSize = 20,
}: {
  endpoint: string;
  idKey: string;
  columns: Column[];
  rows: Row[];
  readOnly?: boolean;
  mediaPrefix?: string;
  /** Rows per page. The pager only appears when the table outgrows one page. */
  pageSize?: number;
}) {
  const router = useRouter();
  const client = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Row>({});
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const [saved, setSaved] = useState<Record<string, Row>>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clamped on read, so disabling a row that empties the last page moves the view
  // back into range on its own — no effect needed to patch a stale page index.
  const { slice: visible, page: currentPage, pageCount, from, to, total } = paginate(
    rows,
    page,
    pageSize,
  );

  function call(method: string, body?: unknown, query = "", onDone?: () => void) {
    setError(null);
    setBusy(true);
    return fetch(endpoint + query, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error?.message ?? `Gagal (${r.status})`);
        onDone?.();
        router.refresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }

  /**
   * Records a row's pending edits as persisted instead of discarding them.
   *
   * Discarding them is what made an uploaded photo vanish on save: the instant the
   * edit was gone the cell fell back to the `rows` prop, which still held the
   * pre-save value until router.refresh() resolved — so the image showed only
   * after a reload. Keeping the overlay lets the cell keep rendering the value we
   * saved, while `saved` is what `dirty` compares against, so Simpan still greys
   * out the moment the save lands.
   */
  function markSaved(id: string) {
    setSaved((prev) => withSaved(prev, id, edits));
  }

  /**
   * Deletes a file the row has just stopped pointing at.
   *
   * Only ever called after the row itself is written, and failures are swallowed
   * on purpose: an unreferenced object left in the bucket costs storage, whereas
   * the reverse order costs a broken cover on the site. Nothing to show staff
   * either way — the save already succeeded.
   */
  async function purgeImage(previousUrl: string) {
    try {
      await deleteImage(client, previousUrl);
    } catch {
      /* orphaned object, not a dangling reference */
    }
  }

  const field = (col: Column, value: unknown, onChange: (v: unknown) => void, rowId = "") => {
    if (col.type === "image") {
      // The bucket path is namespaced by row id, and ids are generated on
      // insert, so a not-yet-created row cannot be uploaded to yet.
      if (!rowId) {
        return <span className="text-xs text-muted-foreground">Setelah disimpan</span>;
      }
      if (!mediaPrefix) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <ImageUploader
          entity={mediaPrefix}
          rowId={rowId}
          value={value === null || value === undefined ? null : String(value)}
          onChange={onChange as (v: string | null) => void}
          label={col.label}
        />
      );
    }
    if (col.type === "date") {
      return (
        <input
          type="date"
          aria-label={col.label}
          value={value === null || value === undefined ? "" : String(value).slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
        />
      );
    }
    if (col.type === "select") {
      return (
        <SelectField
          size="sm"
          aria-label={col.label}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      );
    }
    if (col.type === "bool") {
      return (
        <input
          type="checkbox"
          aria-label={col.label}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 accent-primary"
        />
      );
    }
    return (
      <input
        type={col.type === "number" ? "number" : "text"}
        aria-label={col.label}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Mengosongkan sel angka berarti "hapus nilai" (null), bukan 0 —
          // Number("") adalah 0 dan menimpa harga asli secara diam-diam.
          onChange(col.type === "number" ? (raw.trim() === "" ? null : Number(raw)) : raw);
        }}
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
      />
    );
  };

  return (
    <div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          {columns.map((c) => (
            <label key={c.key} className="text-xs text-muted-foreground">
              {c.label}
              <div className="mt-1 w-36">
                {field(c, draft[c.key], (v) => setDraft({ ...draft, [c.key]: normalizeCell(c.type, v) }))}
              </div>
            </label>
          ))}
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              call(
                "POST",
                Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "" && v !== undefined)),
                "",
                // An empty form is the honest state after a row was created; leaving
                // the draft filled meant the next Tambah silently duplicated it.
                () => setDraft({}),
              )
            }
          >
            Tambah
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-2">{idKey}</th>
              {columns.map((c) => (
                <th key={c.key} className="p-2">
                  {c.label}
                </th>
              ))}
              {!readOnly && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const id = String(r[idKey]);
              const cellValue = (c: Column) => (edits[id]?.[c.key] !== undefined ? edits[id][c.key] : r[c.key]);
              const dirty = isRowDirty(columns, edits, saved, id, r);
              return (
                <tr key={id} className="border-b border-border/50">
                  <td className="p-2 font-medium">{id}</td>
                  {columns.map((c) => (
                    <td key={c.key} className="p-2">
                      {readOnly ? (
                        String(r[c.key] ?? "—")
                      ) : (
                        <div className="w-32">
                          {field(
                        c,
                        cellValue(c),
                        (v) => setEdits({ ...edits, [id]: { ...edits[id], [c.key]: normalizeCell(c.type, v) } }),
                        id,
                      )}
                        </div>
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="flex gap-1 p-2">
                      <Button
                        size="xs"
                        disabled={busy || !dirty}
                        onClick={() =>
                          call("PATCH", { id, ...edits[id] }, "", () => {
                            markSaved(id);
                            // `saved` still holds the pre-save value, which is exactly
                            // the file the row is about to stop pointing at.
                            const stale = orphanedImageUrl(
                              edits[id],
                              saved[id]?.image_url ?? r.image_url,
                            );
                            if (stale) void purgeImage(stale);
                          })
                        }
                      >
                        Simpan
                      </Button>
                      <Button size="xs" variant="destructive" disabled={busy} onClick={() => call("DELETE", undefined, `?id=${encodeURIComponent(id)}`)}>
                        Nonaktif
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data.</p>}
      </div>

      {/* Only once the table outgrows one page — a pager on 12 snack rows is noise. */}
      {pageCount > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Menampilkan <span className="font-medium text-foreground">{from}</span>–
            <span className="font-medium text-foreground">{to}</span> dari{" "}
            <span className="font-medium text-foreground">{total}</span> baris
          </p>

          <nav aria-label="Paginasi" className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Sebelumnya
            </Button>
            {pageWindow(currentPage, pageCount).map((entry, i) =>
              entry === "gap" ? (
                <span key={`gap-${i}`} aria-hidden className="px-1 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={entry}
                  size="xs"
                  variant={entry === currentPage ? "default" : "ghost"}
                  aria-current={entry === currentPage ? "page" : undefined}
                  onClick={() => setPage(entry)}
                >
                  {entry}
                </Button>
              ),
            )}
            <Button
              size="xs"
              variant="ghost"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
