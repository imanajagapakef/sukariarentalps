"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Gamepad2, Lock, PowerOff, RefreshCcw, Sparkles, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fmtDuration, fmtISODay, fmtTime } from "@/lib/format";
import type { Slot } from "@/lib/validations/booking";

/* ------------------------------------------------------------------ *
 * Status unit (langkah 1)
 * Status ini kondisi SEKARANG, bukan ketersediaan di jam pilihan.
 * ------------------------------------------------------------------ */

const UNIT_STATUS: Record<string, { label: string; Icon: LucideIcon; tone: string; blocked: boolean }> = {
  AVAILABLE: { label: "Kosong sekarang", Icon: Check, tone: "text-primary", blocked: false },
  IN_USE: { label: "Sedang dipakai", Icon: Gamepad2, tone: "text-warning", blocked: false },
  BOOKED: { label: "Sudah dipesan", Icon: Lock, tone: "text-warning", blocked: false },
  MAINTENANCE: { label: "Perawatan", Icon: Wrench, tone: "text-muted-foreground", blocked: true },
  OFFLINE: { label: "Offline", Icon: PowerOff, tone: "text-muted-foreground", blocked: true },
};

/** Unit yang tidak bisa dipilih sama sekali, supaya tidak jadi pilihan yang pasti gagal. */
export function isUnitBlocked(status: string): boolean {
  return UNIT_STATUS[status]?.blocked ?? false;
}

export function UnitStatusChip({ status }: { status: string }) {
  const ui = UNIT_STATUS[status] ?? { label: status.toLowerCase(), Icon: Lock, tone: "text-muted-foreground" };
  const Icon = ui.Icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${ui.tone}`}>
      <Icon aria-hidden className="size-3.5" />
      {ui.label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Pemilih jam mulai (langkah 2)
 * ------------------------------------------------------------------ */

const SLOT_UI: Record<string, { label: string; Icon: LucideIcon }> = {
  AVAILABLE: { label: "Kosong", Icon: Check },
  BOOKED: { label: "Dipesan", Icon: Lock },
  IN_USE: { label: "Dipakai", Icon: Gamepad2 },
  CLEANING: { label: "Dibersihkan", Icon: Sparkles },
};

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_255_255/0.05)_7px_14px)]";

/** Jam dan menit dalam WIB untuk sebuah ISO string. */
function wibParts(iso: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

function periodOf(hour: number): string {
  if (hour < 5) return "Dini hari";
  if (hour < 11) return "Pagi";
  if (hour < 15) return "Siang";
  if (hour < 18) return "Sore";
  return "Malam";
}

type SlotPickerProps = {
  slots: Slot[] | null;
  error?: string | null;
  startIso: string | null;
  /** Null dihapus pilihan. */
  onPick: (iso: string | null) => void;
  durationMinutes: number;
  /** Ambil ulang grid; dipakai tombol Perbarui. */
  onRefresh?: () => void;
  /** Date.now() saat grid terakhir dimuat. */
  refreshedAt?: number | null;
  /** Dipanggil dari pesan "tidak ada slot kosong". */
  onNextDay?: () => void;
};

export function SlotPicker({
  slots,
  error = null,
  startIso,
  onPick,
  durationMinutes,
  onRefresh,
  refreshedAt,
  onNextDay,
}: SlotPickerProps) {
  const [onlyFree, setOnlyFree] = useState(false);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const list = useMemo(() => slots ?? [], [slots]);
  const isFree = (s: Slot) => s.state === "AVAILABLE";
  const free = useMemo(() => list.filter(isFree), [list]);

  // Jam yang ikut terpakai oleh durasi pilihan: slot terpilih + setiap slot
  // yang awalnya berada di dalam rentang waktu [start, start + durasi).
  const covered = useMemo(() => {
    const set = new Set<string>();
    const picked = list.find((s) => s.slot_start === startIso && isFree(s));
    if (!picked || !startIso) return set;
    const pickedStart = new Date(picked.slot_start).getTime();
    const pickedEnd = pickedStart + durationMinutes * 60_000;
    for (const s of list) {
      if (s.slot_start === startIso) continue;
      const sStart = new Date(s.slot_start).getTime();
      if (sStart >= pickedStart && sStart < pickedEnd) {
        set.add(s.slot_start);
      }
    }
    return set;
  }, [list, startIso, durationMinutes]);

  const visible = useMemo(() => (onlyFree ? list.filter(isFree) : list), [list, onlyFree]);

  const groups = useMemo(() => {
    const out: { period: string; items: Slot[] }[] = [];
    for (const s of visible) {
      const period = periodOf(wibParts(s.slot_start).hour);
      const last = out[out.length - 1];
      if (last && last.period === period) last.items.push(s);
      else out.push({ period, items: [s] });
    }
    return out;
  }, [visible]);

  const presentStates = useMemo(() => Array.from(new Set(list.map((s) => s.state))), [list]);

  // Roving tabindex: satu tab stop untuk seluruh grid.
  const tabStop = free.find((s) => s.slot_start === startIso)?.slot_start ?? free[0]?.slot_start;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const enabled = visible.filter(isFree);
    if (enabled.length === 0) return;
    e.preventDefault();
    const focused = (document.activeElement as HTMLElement | null)?.dataset.slot;
    const at = enabled.findIndex((s) => s.slot_start === (focused ?? startIso));
    let next = at;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(enabled.length - 1, at + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (e.key === "Home") next = 0;
    else next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    onPick(target.slot_start);
    refs.current[target.slot_start]?.focus();
  }

  /* ---------------- keadaan non-grid ---------------- */

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        <p className="text-warning">{error}</p>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="mt-2 text-sm font-medium underline underline-offset-2">
            Coba lagi
          </button>
        )}
      </div>
    );
  }

  if (slots === null) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Memuat ketersediaan…</span>
        <div aria-hidden className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (free.length === 0) {
    const hasSchedule = list.length > 0;
    return (
      <div className="rounded-lg border border-border bg-surface-low p-4 text-sm">
        <p className="font-medium">
          {hasSchedule ? "Semua jam di tanggal ini sudah terisi." : "Belum ada jadwal di tanggal ini."}
        </p>
        <p className="mt-1 text-muted-foreground">Coba tanggal lain, atau pilih unit lain di langkah sebelumnya.</p>
        {onNextDay && (
          <button
            type="button"
            onClick={onNextDay}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Lihat hari berikutnya
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground"
          >
            <RefreshCcw className="size-3.5" aria-hidden /> Perbarui
          </button>
        )}
      </div>
    );
  }

  const nearest = free[0];
  const picked = list.find((s) => s.slot_start === startIso && isFree(s));
  const endIso = picked
    ? new Date(Date.parse(picked.slot_start) + durationMinutes * 60_000).toISOString()
    : null;
  const crossesMidnight =
    picked && endIso ? fmtISODay(new Date(endIso)) !== fmtISODay(new Date(picked.slot_start)) : false;

  return (
    <div className="space-y-3">
      {/* Ringkasan: jawaban cepat sebelum orang memindai 24 kotak. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium text-primary">{free.length}</span>{" "}
          <span className="text-muted-foreground"> dari {list.length} jam kosong</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {!picked && nearest && (
            <button
              type="button"
              onClick={() => onPick(nearest.slot_start)}
              className="min-h-11 rounded-lg border border-primary/50 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              Pilih jam terdekat ({fmtTime(nearest.slot_start)})
            </button>
          )}
          {picked && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="min-h-11 rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Hapus pilihan
            </button>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyFree}
              onChange={(e) => setOnlyFree(e.target.checked)}
              className="size-4 accent-primary"
            />
            Hanya yang kosong
          </label>
        </div>
      </div>

      <div role="radiogroup" aria-label="Pilih jam mulai" onKeyDown={onKeyDown} className="space-y-4">
        {groups.map((g) => (
          <div key={g.period}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.period}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.items.map((s) => {
                const open = isFree(s);
                const isPicked = s.slot_start === startIso && open;
                const isCovered = covered.has(s.slot_start);
                const ui = SLOT_UI[s.state] ?? { label: s.state.toLowerCase(), Icon: Lock };
                const Icon = ui.Icon;
                const time = fmtTime(s.slot_start);
                const note = isPicked
                  ? "Dipilih"
                  : isCovered
                    ? `${ui.label} · ikut terpakai`
                    : s.ready_at
                      ? `${ui.label}, ${s.state === "CLEANING" ? "siap" : "selesai"} ${fmtTime(s.ready_at)}`
                      : ui.label;

                return (
                  <button
                    key={s.slot_start}
                    ref={(el) => {
                      refs.current[s.slot_start] = el;
                    }}
                    data-slot={s.slot_start}
                    type="button"
                    role="radio"
                    aria-checked={isPicked}
                    aria-disabled={!open}
                    aria-label={`${time}, ${isCovered ? "ikut terpakai" : note}`}
                    tabIndex={open && s.slot_start === tabStop ? 0 : -1}
                    onClick={() => {
                      if (open) onPick(s.slot_start);
                    }}
                    className={[
                      "flex min-h-16 flex-col justify-between rounded-lg border p-2 text-left transition-ui",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isPicked
                        ? "border-primary bg-primary text-primary-foreground glow-primary"
                        : isCovered
                          ? "border-primary/40 bg-primary/15"
                          : open
                            ? "border-border bg-card hover:border-primary/60 active:scale-[0.98]"
                            : `cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground ${STRIPES}`,
                    ].join(" ")}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="font-display text-sm tabular-nums">{time}</span>
                      <Icon aria-hidden className={`size-3.5 shrink-0 ${open ? "" : "opacity-70"}`} />
                    </span>
                    <span className={`text-xs leading-tight ${isPicked ? "" : open ? "text-muted-foreground" : ""}`}>
                      {note}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legenda hanya untuk status yang benar-benar muncul, dengan bentuk yang sama seperti kotaknya. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {presentStates.map((k) => {
          const ui = SLOT_UI[k] ?? { label: k.toLowerCase(), Icon: Lock };
          const Icon = ui.Icon;
          return (
            <li key={k} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={`grid size-5 place-items-center rounded border ${
                  k === "AVAILABLE" ? "border-border bg-card" : `border-border/50 bg-muted/40 ${STRIPES}`
                }`}
              >
                <Icon className="size-3" />
              </span>
              {ui.label}
            </li>
          );
        })}
      </ul>

      {picked && endIso && (
        <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
          Kamu main <span className="font-medium">{fmtTime(picked.slot_start)}</span> sampai{" "}
          <span className="font-medium">{fmtTime(endIso)}</span>
          {crossesMidnight ? " (hari berikutnya)" : ""}, {fmtDuration(durationMinutes)}.
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Ketersediaan bisa berubah. Perbarui sebelum lanjut
          {refreshedAt ? `, terakhir ${fmtTime(new Date(refreshedAt).toISOString())}` : ""}.
        </span>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="min-h-11 font-medium text-foreground underline underline-offset-2">
            Perbarui
          </button>
        )}
      </p>
    </div>
  );
}