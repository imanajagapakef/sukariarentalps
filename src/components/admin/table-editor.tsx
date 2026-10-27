"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/admin/image-uploader";
import { SelectField } from "@/components/ui/select-field";
import { isRowDirty, normalizeCell, pageWindow, paginate, withSaved } from "@/lib/table-edit-state";
import { deleteImage, orphanedImageUrl } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Column = {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "bool" | "image" | "date";
  options?: { value: string; label: string }[];
  required?: boolean;
};

type Row = Record<string, unknown>;
type SortState = { key: string; dir: "asc" | "desc" } | null;

/** Waktu "Yakin?" menunggu sebelum kembali ke tombol biasa. */
const ARM_TIMEOUT_MS = 4_000;
const NOTICE_MS = 2_500;

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Teks yang dilihat orang untuk sebuah sel: label untuk select, bukan id mentahnya. */
function shown(col: Column, v: unknown): string {
  if (isEmpty(v)) return "";
  if (col.type === "select") return col.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (col.type === "date") return String(v).slice(0, 10);
  if (col.type === "bool") return v ? "Ya" : "Tidak";
  return String(v);
}

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm transition-colors " +
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 " +
  "aria-[invalid=true]:border-coral";

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
 *
 * Search, sort and the "belum disimpan" filter read the STORED row, never the
 * overlay: a row that stopped matching the search because of what you just typed
 * into it would vanish from under your cursor.
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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyDirty, setOnlyDirty] = useState(false);
  const [sort, setSort] = useState<SortState>(null);
  const [addOpen, setAddOpen] = useState(rows.length === 0);
  const [attempted, setAttempted] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);

  // A ref, not just state: two quick taps can both read "not busy" before the first
  // setState has re-rendered, and the result is a duplicated POST.
  const inFlight = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = busyKey !== null || pending;

  /* ---------------------------- turunan dari rows --------------------------- */
  const q = query.trim().toLowerCase();
  const matches = (r: Row) =>
    !q ||
    [String(r[idKey] ?? ""), ...columns.filter((c) => c.type !== "image").map((c) => shown(c, r[c.key]))].some((t) =>
      t.toLowerCase().includes(q),
    );
  const rowDirty = (r: Row) => isRowDirty(columns, edits, saved, String(r[idKey]), r);
  const dirtyRows = rows.filter(rowDirty);
  const dirtyCount = dirtyRows.length;
  // The filter releases itself once nothing is left to save, instead of stranding the
  // user on an empty "belum disimpan" list.
  const dirtyFilter = onlyDirty && dirtyCount > 0;

  let list = rows.filter((r) => matches(r) && (!dirtyFilter || rowDirty(r)));
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    const mul = sort.dir === "asc" ? 1 : -1;
    list = [...list].sort((x, y) => {
      const a = x[sort.key];
      const b = y[sort.key];
      const ea = isEmpty(a);
      const eb = isEmpty(b);
      // Empties sink to the bottom whichever way the column is sorted.
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
      if (typeof a === "number" && typeof b === "number") return mul * (a - b);
      if (typeof a === "boolean" && typeof b === "boolean") return mul * (Number(a) - Number(b));
      const ta = col ? shown(col, a) : String(a);
      const tb = col ? shown(col, b) : String(b);
      return mul * ta.localeCompare(tb, "id", { numeric: true, sensitivity: "base" });
    });
  }

  // Clamped on read, so disabling a row that empties the last page moves the view
  // back into range on its own — no effect needed to patch a stale page index.
  const { slice: visible, page: currentPage, pageCount, from, to, total } = paginate(list, page, pageSize);

  /* -------------------------------- efek -------------------------------- */
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), ARM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [armed]);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Edits live only in this component's memory: closing the tab loses them silently.
  // (A client-side navigation does not fire this; that part is on the router.)
  useEffect(() => {
    if (dirtyCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount]);

  /* ------------------------------- jaringan ------------------------------- */
  function flash(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }

  async function request(method: string, body?: unknown, qs = ""): Promise<void> {
    let res: Response;
    try {
      res = await fetch(endpoint + qs, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // The request may have reached the server before the connection dropped, so for a
      // POST "try again" is the wrong advice — it is how one row becomes two.
      throw new Error(
        method === "POST"
          ? "Koneksi terputus. Baris mungkin sudah tersimpan — muat ulang dan cek dulu sebelum menambah lagi."
          : "Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.",
      );
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
  }

  async function run(
    key: string,
    job: () => Promise<void>,
    opts?: { notice?: string; refreshAlways?: boolean },
  ): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    setArmed(null);
    setBusyKey(key);
    let ok = false;
    try {
      await job();
      ok = true;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
      return false;
    } finally {
      // The spinner lasts until router.refresh() lands, not just until the request does,
      // so a button never re-arms against the pre-save rows.
      if (ok || opts?.refreshAlways) startTransition(() => router.refresh());
      if (ok && opts?.notice) flash(opts.notice);
      inFlight.current = false;
      setBusyKey(null);
    }
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

  /**
   * Persists one row, then records its edits as saved instead of discarding them.
   *
   * Discarding them is what made an uploaded photo vanish on save: the instant the
   * edit was gone the cell fell back to the `rows` prop, which still held the
   * pre-save value until router.refresh() resolved — so the image showed only
   * after a reload. Keeping the overlay lets the cell keep rendering the value we
   * saved, while `saved` is what `dirty` compares against, so Simpan still greys
   * out the moment the save lands.
   *
   * `snapshot` is the edits as they were when the user pressed the button, so typing
   * into another row during a long "Simpan semua" cannot sneak into the wrong PATCH.
   */
  async function saveRow(id: string, r: Row, snapshot: Record<string, Row>) {
    await request("PATCH", { id, ...snapshot[id] });
    setSaved((prev) => withSaved(prev, id, snapshot));
    // `saved` still holds the pre-save value, which is exactly the file the row is
    // about to stop pointing at.
    const stale = orphanedImageUrl(snapshot[id], saved[id]?.image_url ?? r.image_url);
    if (stale) void purgeImage(stale);
  }

  function onSave(id: string, r: Row) {
    void run(`save:${id}`, () => saveRow(id, r, edits), { notice: "Baris disimpan" });
  }

  function onSaveAll() {
    const snapshot = edits;
    const targets = dirtyRows;
    void run(
      "all",
      async () => {
        let done = 0;
        for (const r of targets) {
          const id = String(r[idKey]);
          try {
            await saveRow(id, r, snapshot);
            done += 1;
          } catch (e) {
            throw new Error(
              `${done} dari ${targets.length} baris tersimpan. Berhenti di ${id}: ${e instanceof Error ? e.message : "gagal"}`,
            );
          }
        }
      },
      // Rows saved before a failure are real; refresh so the table shows them.
      { notice: `${targets.length} baris disimpan`, refreshAlways: true },
    );
  }

  function onDelete(id: string) {
    if (armed !== `del:${id}`) {
      setError(null);
      setArmed(`del:${id}`);
      return;
    }
    void run(`del:${id}`, () => request("DELETE", undefined, `?id=${encodeURIComponent(id)}`), {
      notice: "Baris dinonaktifkan",
    });
  }

  function onRevert(id: string) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const missing = columns.filter(
    (c) => c.required && c.type !== "image" && c.type !== "bool" && isEmpty(draft[c.key]),
  );

  function onAdd() {
    setAttempted(true);
    if (missing.length > 0) return;
    const payload = Object.fromEntries(
      Object.entries(draft).filter(([, v]) => v !== "" && v !== undefined && v !== null),
    );
    if (Object.keys(payload).length === 0) {
      setError("Isi minimal satu kolom sebelum menambah baris.");
      return;
    }
    void run(
      "add",
      async () => {
        await request("POST", payload);
        // An empty form is the honest state after a row was created; leaving
        // the draft filled meant the next Tambah silently duplicated it.
        setDraft({});
        setAttempted(false);
      },
      { notice: "Baris ditambahkan" },
    );
  }

  function onRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, id: string, r: Row) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    const type = (target as HTMLInputElement).type;
    if (type === "file" || type === "checkbox") return;
    if (busy || !rowDirty(r)) return;
    e.preventDefault();
    onSave(id, r);
  }

  function toggleSort(key: string) {
    setPage(1);
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const setCell = (id: string, c: Column, v: unknown) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [c.key]: normalizeCell(c.type, v) } }));

  /* -------------------------------- field -------------------------------- */
  const field = (col: Column, value: unknown, onChange: (v: unknown) => void, rowId = "", invalid = false) => {
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
          aria-invalid={invalid}
          value={value === null || value === undefined ? "" : String(value).slice(0, 10)}
          onChange={(e) => onChange(e.target.value || null)}
          className={fieldClass}
        />
      );
    }
    if (col.type === "select") {
      return (
        <SelectField
          size="sm"
          aria-label={col.label}
          aria-invalid={invalid}
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
          className="size-5 accent-primary"
        />
      );
    }
    return (
      <input
        type={col.type === "number" ? "number" : "text"}
        aria-label={col.label}
        aria-invalid={invalid}
        value={value === null || value === undefined ? "" : String(value)}
        // A focused number input changes its value when the page is scrolled over it.
        onWheel={col.type === "number" ? (e) => e.currentTarget.blur() : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          // Mengosongkan sel angka berarti "hapus nilai" (null), bukan 0 —
          // Number("") adalah 0 dan menimpa harga asli secara diam-diam.
          onChange(col.type === "number" ? (raw.trim() === "" ? null : Number(raw)) : raw);
        }}
        className={fieldClass}
      />
    );
  };

  /** Isi sel untuk mode baca-saja: label, bukan id mentah; gambar jadi thumbnail. */
  const readCell = (c: Column, v: unknown) => {
    if (c.type === "image") {
      return isEmpty(v) ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={String(v)} alt={c.label} loading="lazy" className="size-12 rounded-lg border border-border object-cover" />
      );
    }
    const t = shown(c, v);
    return t ? <span>{t}</span> : <span className="text-muted-foreground">—</span>;
  };

  const sortHeader = (key: string, label: string) => {
    const active = sort?.key === key;
    const Icon = !active ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
        className="whitespace-nowrap p-2 font-semibold"
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground"
        >
          {label}
          <Icon aria-hidden className={cn("size-3", active ? "text-primary" : "opacity-40")} />
        </button>
      </th>
    );
  };

  const colSpan = columns.length + 1 + (readOnly ? 0 : 1);
  const hasRows = rows.length > 0;

  return (
    <div className="space-y-3">
      {/* ---------------------------- umpan balik ---------------------------- */}
      <div aria-live="polite" className="space-y-2">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Tutup pesan" className="shrink-0 rounded p-0.5 hover:bg-coral/20">
              <X aria-hidden className="size-4" />
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            <Check aria-hidden className="size-3.5" /> {notice}
          </p>
        )}
      </div>

      {/* ------------------------------ toolbar ------------------------------ */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1 sm:flex-none">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari di tabel…"
            aria-label="Cari baris"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-64"
          />
        </label>

        {dirtyCount > 0 && (
          <button
            type="button"
            aria-pressed={dirtyFilter}
            onClick={() => {
              setOnlyDirty((v) => !v);
              setPage(1);
            }}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold uppercase tracking-wide transition-colors",
              dirtyFilter ? "border-amber bg-amber/20 text-amber" : "border-amber/40 bg-amber/10 text-amber hover:bg-amber/20",
            )}
          >
            <span aria-hidden className="size-2 rounded-full bg-amber" />
            {dirtyCount} belum disimpan
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dirtyCount > 1 && (
            <Button size="sm" disabled={busy} onClick={onSaveAll} className="gap-1.5 font-bold">
              {busyKey === "all" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Save aria-hidden className="size-3.5" />}
              Simpan semua ({dirtyCount})
            </Button>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant={addOpen ? "secondary" : "default"}
              aria-expanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
              className="gap-1.5 font-bold"
            >
              {addOpen ? <X aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
              {addOpen ? "Tutup form" : "Tambah baru"}
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------ tambah ------------------------------- */}
      {!readOnly && addOpen && (
        <section className="relative isolate overflow-hidden rounded-2xl border border-primary/30 bg-card p-4">
          <div aria-hidden className="absolute -right-10 -top-12 -z-10 size-40 rounded-full bg-primary/15 blur-3xl" />
          <h3 className="font-display flex items-center gap-2 text-base uppercase">
            <Plus aria-hidden className="size-4 text-primary" /> Baris baru
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {columns.map((c) => {
              const bad = attempted && missing.some((m) => m.key === c.key);
              return (
                <div key={c.key} className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {c.label}
                    {c.required && <span className="ml-0.5 text-coral">*</span>}
                  </span>
                  {field(c, draft[c.key], (v) => setDraft((d) => ({ ...d, [c.key]: normalizeCell(c.type, v) })), "", bad)}
                  {bad && <p className="text-[11px] text-coral">Wajib diisi.</p>}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={onAdd} className="gap-1.5 font-bold">
              {busyKey === "add" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Plus aria-hidden className="size-3.5" />}
              Tambah
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || Object.keys(draft).length === 0}
              onClick={() => {
                setDraft({});
                setAttempted(false);
              }}
            >
              Kosongkan
            </Button>
          </div>
        </section>
      )}

      {/* ------------------------------- tabel ------------------------------- */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-container text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 pl-4 pr-2 font-semibold">{sortHeader(idKey, "ID").props.children}</th>
              {columns.map((c) =>
                c.type === "image" ? (
                  <th key={c.key} scope="col" className="p-2 font-semibold uppercase tracking-wide">
                    {c.label}
                  </th>
                ) : (
                  sortHeader(c.key, c.label)
                ),
              )}
              {!readOnly && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const id = String(r[idKey]);
              const cellValue = (c: Column) => (edits[id]?.[c.key] !== undefined ? edits[id][c.key] : r[c.key]);
              const dirty = rowDirty(r);
              const justSaved = !dirty && saved[id] !== undefined;
              const saving = busyKey === `save:${id}`;
              const armedDel = armed === `del:${id}`;
              return (
                <tr
                  key={id}
                  onKeyDown={readOnly ? undefined : (e) => onRowKeyDown(e, id, r)}
                  className={cn("border-t border-border/60 align-middle transition-colors hover:bg-accent/30", dirty && "bg-amber/5")}
                >
                  <td className="relative py-2 pl-4 pr-2">
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-0 left-0 w-1", dirty ? "bg-amber" : justSaved ? "bg-primary" : "bg-transparent")}
                    />
                    <span
                      title={id}
                      className="inline-block max-w-28 truncate rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[11px]"
                    >
                      {id}
                    </span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="p-2">
                      {readOnly ? (
                        readCell(c, r[c.key])
                      ) : (
                        <div className={cn(c.type === "image" ? "w-32" : c.type === "bool" ? "" : "min-w-34")}>
                          {field(c, cellValue(c), (v) => setCell(id, c, v), id)}
                        </div>
                      )}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="sticky right-0 bg-card p-2 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]">
                      <div className="flex items-center justify-end gap-1.5">
                        {dirty ? (
                          <span className="hidden text-[10px] font-bold uppercase tracking-wide text-amber xl:inline">Belum disimpan</span>
                        ) : justSaved ? (
                          <span className="hidden items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary xl:inline-flex">
                            <Check aria-hidden className="size-3" /> Tersimpan
                          </span>
                        ) : null}
                        {dirty && (
                          <Button size="xs" variant="ghost" disabled={busy} onClick={() => onRevert(id)} aria-label={`Batalkan perubahan ${id}`} title="Batalkan perubahan">
                            <Undo2 aria-hidden className="size-3.5" />
                          </Button>
                        )}
                        <Button size="xs" disabled={busy || !dirty} onClick={() => onSave(id, r)} aria-busy={saving} className="gap-1">
                          {saving ? <Loader2 aria-hidden className="size-3 animate-spin" /> : <Save aria-hidden className="size-3" />}
                          Simpan
                        </Button>
                        {armedDel ? (
                          <>
                            <Button size="xs" variant="destructive" disabled={busy} onClick={() => onDelete(id)} className="animate-pulse gap-1 font-bold">
                              {busyKey === `del:${id}` && <Loader2 aria-hidden className="size-3 animate-spin" />}
                              Yakin?
                            </Button>
                            <Button size="xs" variant="ghost" disabled={busy} onClick={() => setArmed(null)} aria-label="Batal">
                              <X aria-hidden className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button size="xs" variant="destructive" disabled={busy} onClick={() => onDelete(id)} className="gap-1">
                            <Trash2 aria-hidden className="size-3" /> Nonaktif
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
                  {!hasRows
                    ? "Belum ada data."
                    : dirtyFilter
                      ? "Tidak ada baris yang belum disimpan."
                      : `Tidak ada baris yang cocok dengan “${query.trim()}”.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------- footer ------------------------------ */}
      {hasRows && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {pageCount > 1 || q || dirtyFilter ? (
              <>
                Menampilkan <span className="font-medium text-foreground">{from}</span>–
                <span className="font-medium text-foreground">{to}</span> dari{" "}
                <span className="font-medium text-foreground">{total}</span> baris
                {(q || dirtyFilter) && <span> (difilter dari {rows.length})</span>}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{rows.length}</span> baris
              </>
            )}
          </p>

          {/* Only once the table outgrows one page — a pager on 12 snack rows is noise. */}
          {pageCount > 1 && (
            <nav aria-label="Paginasi" className="flex items-center gap-1">
              <Button size="xs" variant="ghost" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="gap-1">
                <ChevronLeft aria-hidden className="size-3.5" /> Sebelumnya
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
              <Button size="xs" variant="ghost" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="gap-1">
                Berikutnya <ChevronRight aria-hidden className="size-3.5" />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}