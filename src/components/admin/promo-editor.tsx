"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import {
  PROMO_STATUSES,
  canPublish,
  duplicateItemKey,
  isPublic,
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
 * the one action here that customers see, and it should look like a decision.
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

  const isNew = !promoId;
  const publishable = canPublish(status, items.length);
  const clash = duplicateItemKey(items);

  async function save() {
    setError(null);
    setNotice(null);
    if (!publishable) {
      setError("Promo tidak bisa ditayangkan tanpa minimal satu item harga.");
      return;
    }
    if (clash) {
      setError(`Fasilitas + durasi sama muncul dua kali (${clash.split(":")[0]}).`);
      return;
    }

    setBusy(true);
    const payload = {
      name: name.trim(),
      branch_id: branchId,
      description: description.trim() || null,
      source_date: sourceDate || null,
      status,
      items,
    };
    try {
      const res = await fetch("/api/admin/promos", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, promotion_id: promoId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      setNotice(isNew ? "Promo dibuat." : "Promo disimpan.");
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

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isNew ? (
              <h3 className="font-display text-lg uppercase">Promo Baru</h3>
            ) : (
              <>
                <h3 className="font-display text-lg uppercase">{name || "(tanpa nama)"}</h3>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{promoId}</span>
              </>
            )}
            <Badge variant={isPublic(status) ? "default" : "secondary"}>
              {status === "ACTIVE" ? "Tayang di situs" : status}
            </Badge>
          </div>
          {!isPublic(status) && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <EyeOff aria-hidden className="size-3.5" />
              Belum tampil di halaman /promo — hanya promo berstatus ACTIVE yang dibaca pelanggan.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !name.trim() || (clash !== null)} onClick={() => void save()}>
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

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">
          Nama promo
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Paket Mantai"
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
                {s}
              </option>
            ))}
          </SelectField>
        </label>

        <label className="text-xs text-muted-foreground">
          Tanggal sumber
          <input
            type="date"
            value={sourceDate}
            onChange={(e) => setSourceDate(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </label>

        <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          Deskripsi (tampil di halaman promo)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Main 2 jam, bayar 1 jam."
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {/* PRICE LIST */}
      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display text-sm uppercase tracking-wide">Daftar Harga</h4>
          <span className="text-xs text-muted-foreground">{items.length} item</span>
        </div>

        {items.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Belum ada harga. Promo tanpa harga tidak bisa ditayangkan.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((item, index) => (
              <li key={`${item.facility_type_id}-${item.duration_minutes}-${index}`} className="flex flex-wrap items-end gap-2">
                <SelectField
                  size="sm"
                  value={item.facility_type_id}
                  onChange={(e) => updateItem(index, { facility_type_id: e.target.value })}
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
                    value={item.duration_minutes}
                    onChange={(e) => updateItem(index, { duration_minutes: Number(e.target.value) || 0 })}
                    className="mt-1 h-8 w-28 rounded-md border border-input bg-card px-2 text-sm"
                  />
                </label>

                <label className="text-xs text-muted-foreground">
                  Harga
                  <input
                    type="number"
                    min={0}
                    value={item.price}
                    onChange={(e) => updateItem(index, { price: Number(e.target.value) || 0 })}
                    className="mt-1 h-8 w-32 rounded-md border border-input bg-card px-2 text-sm"
                  />
                </label>

                {/* R7: the free extra. Quantity follows the snack, so a chosen snack
                    with a blank box still saves as 1 rather than a bare id. */}
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
                      max={20}
                      value={item.bonus_quantity ?? 1}
                      onChange={(e) =>
                        updateItem(index, { bonus_quantity: Number(e.target.value) || 1 })
                      }
                      className="mt-1 h-8 w-20 rounded-md border border-input bg-card px-2 text-sm"
                    />
                  </label>
                )}

                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={busy}
                  aria-label="Hapus item harga"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              setItems((prev) => [
                ...prev,
                { facility_type_id: facilityOptions[0]?.id ?? "", duration_minutes: 120, price: 0 },
              ])
            }
          >
            <Plus aria-hidden className="size-3" /> Tambah harga
          </Button>
          {!publishable && status === "ACTIVE" && (
            <span className="text-xs text-warning">Tambah minimal satu harga dulu sebelum menayangkan.</span>
          )}
          {isPublic(status) && publishable && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Eye aria-hidden className="size-3" /> Tampil di /promo selama status ACTIVE
            </span>
          )}
        </div>
      </div>
    </div>
  );
}