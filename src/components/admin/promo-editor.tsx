"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Gift,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import {
  DURATION_PRESETS,
  MAX_BONUS_QUANTITY,
  PROMO_STATUSES,
  STATUS_META,
  bonusCount,
  formatDuration,
  formatRupiah,
  headlinePrice,
  isPublic,
  nextFreeDuration,
  normalizeItems,
  promoReadiness,
  promoSignature,
  submitBlocker,
  validateItems,
  type PromoItem,
  type PromoStatus,
} from "@/lib/promo-rules";

/**
 * One promo, its price list and its publish state.
 *
 * The whole card is the form: the price rows are edited in place and saved together
 * with the heading and status, so "the promo is live but the prices are stale" is not
 * a state this component can produce.
 *
 * Status is deliberately a plain select rather than a toggle. Turning a promo on is
 * the one action here that customers see, and it should look like a decision — so the
 * first save that takes a promo live also asks for a confirmation.
 *
 * What the card adds on top of that:
 *  - a live preview of the /promo card, so staff see what customers will see
 *  - per-row validation (clash, empty facility, bad bonus) instead of one generic error
 *  - dirty tracking: Simpan is only enabled when something changed, Reset undoes it
 *  - Ctrl/⌘+S to save, collapse to a one-line summary when the list gets long
 *  - after creating a promo, the blank "new" card clears itself instead of keeping
 *    the values it just saved
 */
export function PromoEditor({
  promoId,
  initial,
  branchOptions,
  facilityOptions,
  snackOptions = [],
  canDelete = true,
}: {
  /** Empty for a new promo. */
  promoId: string;
  initial: {
    name: string;
    branch_id: string;
    description: string | null;
    source_date: string | null;
    status: PromoStatus;
    items: PromoItem[];
  };
  branchOptions: { id: string; label: string }[];
  facilityOptions: { id: string; label: string }[];
  /** R7: snacks a staff member can attach as a free extra on a package. */
  snackOptions?: { id: string; label: string }[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [branchId, setBranchId] = useState(initial.branch_id);
  const [description, setDescription] = useState(initial.description ?? "");
  const [sourceDate, setSourceDate] = useState(initial.source_date ?? "");
  const [status, setStatus] = useState<PromoStatus>(initial.status);
  const [items, setItems] = useState<PromoItem[]>(initial.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const isNew = !promoId;

  const snapshotOf = (s: {
    name: string;
    branchId: string;
    description: string;
    sourceDate: string;
    status: string;
    items: PromoItem[];
  }) => promoSignature(s);

  const [baseline, setBaseline] = useState(() =>
    snapshotOf({
      name: initial.name,
      branchId: initial.branch_id,
      description: initial.description ?? "",
      sourceDate: initial.source_date ?? "",
      status: initial.status,
      items: initial.items,
    }),
  );
  const [savedStatus, setSavedStatus] = useState<PromoStatus>(initial.status);

  const current = snapshotOf({ name, branchId, description, sourceDate, status, items });
  const dirty = current !== baseline;

  const issues = useMemo(() => validateItems(items), [items]);
  const issuesByRow = useMemo(() => {
    const map = new Map<number, typeof issues>();
    for (const issue of issues) map.set(issue.index, [...(map.get(issue.index) ?? []), issue]);
    return map;
  }, [issues]);

  const blocker = submitBlocker({ name, branchId, status, items });
  const canSubmit = !busy && !blocker && (isNew || dirty);
  const readiness = promoReadiness(status, items.length);
  const headline = headlinePrice(items);
  const bonuses = bonusCount(items);
  const warnings = issues.filter((i) => i.severity === "warning").length;

  const facilityLabel = (id: string) => facilityOptions.find((f) => f.id === id)?.label ?? "—";
  const snackLabel = (id: string | null | undefined) =>
    id ? (snackOptions.find((s) => s.id === id)?.label ?? id) : null;

  function resetToSaved() {
    setName(initial.name);
    setBranchId(initial.branch_id);
    setDescription(initial.description ?? "");
    setSourceDate(initial.source_date ?? "");
    setStatus(savedStatus);
    setItems(initial.items);
    setError(null);
    setNotice(null);
  }

  async function save() {
    setError(null);
    setNotice(null);
    if (blocker) {
      setError(blocker);
      return;
    }
    if (status === "ACTIVE" && savedStatus !== "ACTIVE") {
      const ok = confirm(
        `Tayangkan "${name.trim()}" sekarang? Pelanggan langsung bisa melihat dan memakai promo ini.`,
      );
      if (!ok) return;
    }

    setBusy(true);
    const payload = {
      name: name.trim(),
      branch_id: branchId,
      description: description.trim() || null,
      source_date: sourceDate || null,
      status,
      items: normalizeItems(items),
    };
    try {
      const res = await fetch("/api/admin/promos", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, promotion_id: promoId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);

      if (isNew) {
        // The saved promo now shows up as its own card after the refresh; the blank
        // card must go back to blank, not sit there holding a copy of it.
        setName("");
        setDescription("");
        setSourceDate("");
        setStatus("DRAFT");
        setItems([]);
        setBaseline(
          snapshotOf({ name: "", branchId, description: "", sourceDate: "", status: "DRAFT", items: [] }),
        );
        setSavedStatus("DRAFT");
        setNotice(`Promo "${payload.name}" dibuat — cek kartunya di atas.`);
      } else {
        setBaseline(current);
        setSavedStatus(status);
        setNotice(status === "ACTIVE" ? "Tersimpan — promo tayang di /promo." : "Promo disimpan.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!promoId) return;
    if (!confirm(`Hapus promo "${name}"? Daftar harganya ikut terhapus.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promos?id=${encodeURIComponent(promoId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setBusy(false);
    }
  }

  const updateItem = (index: number, patch: Partial<PromoItem>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const addItem = () =>
    setItems((prev) => {
      const facility = facilityOptions[0]?.id ?? "";
      return [
        ...prev,
        { facility_type_id: facility, duration_minutes: nextFreeDuration(prev, facility, 60), price: 0 },
      ];
    });

  const duplicateItem = (index: number) =>
    setItems((prev) => {
      const src = prev[index];
      if (!src) return prev;
      const copy: PromoItem = {
        ...src,
        duration_minutes: nextFreeDuration(prev, src.facility_type_id, src.duration_minutes + 60),
      };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });

  // Accent strip + status chip colours, one place so the card reads at a glance.
  const accent =
    readiness === "live"
      ? "bg-primary"
      : readiness === "ready"
        ? "bg-warning"
        : readiness === "ended"
          ? "bg-muted-foreground/40"
          : "bg-border";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md ${
        dirty ? "border-warning/60" : "border-border"
      }`}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (canSubmit) void save();
        }
      }}
    >
      <div aria-hidden className={`h-1.5 w-full ${accent}`} />

      <div className="p-4 sm:p-5">
        {/* HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Ciutkan kartu promo" : "Buka kartu promo"}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              {isNew ? (
                <h3 className="font-display text-lg uppercase">
                  <Sparkles aria-hidden className="mr-1.5 inline size-4 text-primary" />
                  Promo Baru
                </h3>
              ) : (
                <>
                  <h3 className="font-display text-lg uppercase">{name || "(tanpa nama)"}</h3>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{promoId}</span>
                </>
              )}
              <Badge variant={isPublic(status) ? "default" : "secondary"}>
                {isPublic(status) && (
                  <span aria-hidden className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current" />
                )}
                {status === "ACTIVE" ? "Tayang di situs" : STATUS_META[status].label}
              </Badge>
              {readiness === "ready" && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  Siap tayang
                </span>
              )}
              {dirty && (
                <span className="flex items-center gap-1 text-xs font-medium text-warning">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-warning" />
                  Belum disimpan
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>

            {!open && (
              <p className="mt-1 text-xs text-muted-foreground">
                {items.length} item
                {headline ? ` · ${headline}` : ""}
                {bonuses > 0 ? ` · ${bonuses} bonus snack` : ""}
              </p>
            )}
          </button>

          <div className="flex flex-wrap gap-2">
            {dirty && !isNew && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={resetToSaved}>
                <RotateCcw aria-hidden className="size-3.5" /> Reset
              </Button>
            )}
            <Button size="sm" disabled={!canSubmit} onClick={() => void save()} title="Ctrl/⌘ + S">
              {isNew ? <Plus aria-hidden className="size-3.5" /> : <Save aria-hidden className="size-3.5" />}
              {isNew ? "Buat promo" : "Simpan"}
            </Button>
            {canDelete && !isNew && (
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>
                <Trash2 aria-hidden className="size-3.5" /> Hapus
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-danger">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
        {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}

        {open && (
          <>
            {!isPublic(status) && (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <EyeOff aria-hidden className="size-3.5 shrink-0" />
                {readiness === "ready"
                  ? "Harga sudah lengkap — ubah status ke ACTIVE untuk menayangkan ke pelanggan."
                  : readiness === "ended"
                    ? STATUS_META.ENDED.hint
                    : "Belum tampil di halaman /promo — hanya promo berstatus ACTIVE yang dibaca pelanggan."}
              </p>
            )}

            {/* DETAILS */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-muted-foreground">
                Nama promo
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Paket Mantai"
                  maxLength={80}
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>

              <label className="text-xs text-muted-foreground">
                Cabang
                <SelectField
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="mt-1 w-full"
                  aria-label="Cabang"
                >
                  <option value="">Pilih cabang</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </SelectField>
              </label>

              <label className="text-xs text-muted-foreground">
                Status
                <SelectField
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PromoStatus)}
                  className="mt-1 w-full"
                  aria-label="Status promo"
                >
                  {PROMO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s} · {STATUS_META[s].label}
                    </option>
                  ))}
                </SelectField>
                <span className="mt-1 block text-[11px] leading-snug">{STATUS_META[status].hint}</span>
              </label>

              <label className="text-xs text-muted-foreground">
                Tanggal sumber
                <input
                  type="date"
                  value={sourceDate}
                  onChange={(e) => setSourceDate(e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                />
              </label>

              <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                <span className="flex items-center justify-between">
                  Deskripsi (tampil di halaman promo)
                  <span className="tabular-nums">{description.length}/200</span>
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="Main 2 jam, bayar 1 jam."
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>

            {/* PRICE LIST */}
            <div className="mt-5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide">
                  <Tag aria-hidden className="size-3.5 text-primary" /> Daftar Harga
                </h4>
                <span className="text-xs text-muted-foreground">
                  {items.length} item
                  {bonuses > 0 ? ` · ${bonuses} bonus` : ""}
                  {warnings > 0 ? ` · ${warnings} perlu dicek` : ""}
                </span>
              </div>

              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-foreground"
                >
                  <Plus aria-hidden className="size-5 text-primary" />
                  Belum ada harga — klik untuk menambah paket pertama.
                  <span className="text-xs">Promo tanpa harga tidak bisa ditayangkan.</span>
                </button>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item, index) => {
                    const rowIssues = issuesByRow.get(index) ?? [];
                    const hasError = rowIssues.some((i) => i.severity === "error");
                    const hasWarning = !hasError && rowIssues.length > 0;
                    return (
                      <li
                        key={index}
                        className={`rounded-xl border p-2.5 transition-colors ${
                          hasError
                            ? "border-danger/60 bg-danger/5"
                            : hasWarning
                              ? "border-warning/50 bg-warning/5"
                              : "border-border bg-background/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-end gap-2">
                          <span
                            aria-hidden
                            className="mb-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold"
                          >
                            {index + 1}
                          </span>

                          <SelectField
                            size="sm"
                            value={item.facility_type_id}
                            onChange={(e) => {
                              const facility = e.target.value;
                              const clashes = items.some(
                                (o, i) =>
                                  i !== index &&
                                  o.facility_type_id === facility &&
                                  o.duration_minutes === item.duration_minutes,
                              );
                              updateItem(index, {
                                facility_type_id: facility,
                                // switching facility must not manufacture a clash on its own
                                ...(clashes
                                  ? {
                                      duration_minutes: nextFreeDuration(
                                        items.filter((_, i) => i !== index),
                                        facility,
                                        item.duration_minutes,
                                      ),
                                    }
                                  : {}),
                              });
                            }}
                            aria-label="Fasilitas"
                            className="w-auto min-w-40 flex-1"
                          >
                            <option value="">Pilih fasilitas</option>
                            {facilityOptions.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </SelectField>

                          <label className="text-xs text-muted-foreground">
                            Durasi (mnt)
                            <input
                              type="number"
                              min={1}
                              step={15}
                              value={item.duration_minutes}
                              onChange={(e) => updateItem(index, { duration_minutes: Number(e.target.value) || 0 })}
                              className="mt-1 h-8 w-24 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                            />
                          </label>

                          <label className="text-xs text-muted-foreground">
                            Harga (Rp)
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={item.price}
                              onChange={(e) => updateItem(index, { price: Number(e.target.value) || 0 })}
                              className="mt-1 h-8 w-32 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                            />
                          </label>

                          <SelectField
                            size="sm"
                            value={item.bonus_snack_id ?? ""}
                            onChange={(e) => {
                              const id = e.target.value || null;
                              updateItem(index, {
                                bonus_snack_id: id,
                                bonus_quantity: id ? Math.max(1, item.bonus_quantity ?? 1) : 0,
                              });
                            }}
                            aria-label="Bonus snack"
                            className="w-auto min-w-36 flex-1"
                          >
                            <option value="">Tanpa bonus</option>
                            {snackOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                Bonus: {s.label}
                              </option>
                            ))}
                          </SelectField>

                          {item.bonus_snack_id && (
                            <label className="text-xs text-muted-foreground">
                              Bonus (pcs)
                              <input
                                type="number"
                                min={1}
                                max={MAX_BONUS_QUANTITY}
                                value={item.bonus_quantity ?? 1}
                                onChange={(e) => updateItem(index, { bonus_quantity: Number(e.target.value) || 1 })}
                                className="mt-1 h-8 w-20 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                              />
                            </label>
                          )}

                          <div className="ml-auto flex gap-1">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={busy}
                              aria-label="Gandakan item harga"
                              title="Gandakan (durasi otomatis naik)"
                              onClick={() => duplicateItem(index)}
                            >
                              <Copy aria-hidden className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={busy}
                              aria-label="Hapus item harga"
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <Trash2 aria-hidden className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8 text-[11px] text-muted-foreground">
                          <Clock aria-hidden className="size-3" />
                          {DURATION_PRESETS.map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => updateItem(index, { duration_minutes: d })}
                              className={`rounded-full border px-2 py-0.5 transition-colors ${
                                item.duration_minutes === d
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:border-primary/60 hover:text-foreground"
                              }`}
                            >
                              {formatDuration(d)}
                            </button>
                          ))}
                          <span className="ml-1 font-medium text-foreground">
                            {formatDuration(item.duration_minutes)} · {formatRupiah(item.price)}
                          </span>
                        </div>

                        {rowIssues.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 pl-8 text-xs">
                            {rowIssues.map((issue, k) => (
                              <li key={k} className={issue.severity === "error" ? "text-danger" : "text-warning"}>
                                {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="xs" variant="ghost" onClick={addItem}>
                  <Plus aria-hidden className="size-3" /> Tambah harga
                </Button>
                {status === "ACTIVE" && items.length === 0 && (
                  <span className="text-xs text-warning">Tambah minimal satu harga dulu sebelum menayangkan.</span>
                )}
                {isPublic(status) && items.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-primary">
                    <Eye aria-hidden className="size-3" /> Tampil di /promo selama status ACTIVE
                  </span>
                )}
                {blocker && dirty && (
                  <span className="text-xs text-muted-foreground">Belum bisa disimpan: {blocker}</span>
                )}
              </div>
            </div>

            {/* LIVE PREVIEW */}
            {items.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 flex items-center gap-1.5 font-display text-sm uppercase tracking-wide">
                  <Eye aria-hidden className="size-3.5 text-primary" /> Pratinjau di /promo
                </h4>
                <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-linear-to-br from-primary/10 via-card to-card p-4">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl"
                  />
                  <div className="relative flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display text-xl uppercase leading-tight">{name.trim() || "Nama promo"}</p>
                      {description.trim() && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{description.trim()}</p>
                      )}
                    </div>
                    {headline && (
                      <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                        {headline}
                      </span>
                    )}
                  </div>
                  <ul className="relative mt-3 space-y-1.5">
                    {normalizeItems(items).map((item, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg bg-background/70 px-3 py-1.5 text-sm"
                      >
                        <span>
                          {facilityLabel(item.facility_type_id)} · {formatDuration(item.duration_minutes)}
                          {item.bonus_snack_id && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                              <Gift aria-hidden className="size-3" />
                              Bonus {item.bonus_quantity}× {snackLabel(item.bonus_snack_id)}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold tabular-nums">{formatRupiah(item.price)}</span>
                      </li>
                    ))}
                  </ul>
                  {!isPublic(status) && (
                    <p className="relative mt-3 text-[11px] text-muted-foreground">
                      Ini tampilan saat tayang — saat ini pelanggan belum melihatnya.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}