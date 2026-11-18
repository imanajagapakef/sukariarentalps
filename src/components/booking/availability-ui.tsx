"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clock, Gamepad2, Lock, PowerOff, RefreshCcw, Sparkles, Wrench } from "lucide-react";
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
  PAST: { label: "Lewat", Icon: Clock },
  OUT_OF_SERVICE: { label: "Nonaktif", Icon: PowerOff },
};

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_255_255/0.05)_7px_14px)]";

/** Satu blok pemakaian: rentang waktu yang ditempati booking atau pembersihan. */
type BusyInfo = { kind: "BOOKING" | "CLEANING"; from: string; until: string };
/** Blok untuk ringkasan; `freeAt` sudah memperhitungkan pembersihan setelahnya. */
type BusyBlock = BusyInfo & { freeAt: string };

/**
 * Mengubah deretan slot menjadi blok-blok.
 *
 * Server (migrasi 0045) mengirim `busy_from`/`busy_until` per slot; slot-slot
 * yang berurutan dalam blok yang sama membawa nilai identik, jadi cukup
 * dilewati. Tanpa langkah ini, blok 18.00–20.00 akan tampil sebagai empat
 * entri terpisah di ringkasan.
 */
function busyEntries(list: Slot[]) {
  const bySlot = new Map<string, BusyInfo>();
  const blocks: BusyInfo[] = [];
  let prevKey = "";

  for (const s of list) {
    if (!s.busy_from || !s.busy_until) continue;
    const kind: BusyInfo["kind"] =
      s.busy_kind === "CLEANING" || s.state === "CLEANING" ? "CLEANING" : "BOOKING";
    const info: BusyInfo = { kind, from: s.busy_from, until: s.busy_until };
    bySlot.set(s.slot_start, info);

    const key = `${kind}|${info.from}|${info.until}`;
    if (key !== prevKey) {
      blocks.push(info);
      prevKey = key;
    }
  }

  return { bySlot, blocks };
}

/**
 * Booking yang langsung disusul pembersihan digabung jadi satu baris:
 * "18.00–20.00 dipesan · kosong 20.30". Tanpa ini orang membaca "kosong
 * 20.00" lalu kecewa karena 30 menit berikutnya justru dibersihkan.
 */
function mergeCleaning(blocks: BusyInfo[]): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const next = blocks[i + 1];
    if (b.kind === "BOOKING" && next?.kind === "CLEANING" && Date.parse(next.from) === Date.parse(b.until)) {
      out.push({ ...b, freeAt: next.until });
      i++; // pembersihannya sudah diwakili baris ini
    } else {
      out.push({ ...b, freeAt: b.until });
    }
  }
  return out;
}

/** Berapa blok yang ditampilkan sebelum diringkas jadi "+N lagi". */
const MAX_SUMMARY = 4;

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

  // Rentang blok untuk ringkasan + catatan per kotak. Dihitung dari `list`
  // (semua slot), bukan `visible`, supaya jadwal tetap utuh walau filter
  // "Hanya yang kosong" dinyalakan.
  const { bySlot: busyBySlot, blocks: busyBlockInfo } = useMemo(() => busyEntries(list), [list]);
  const blocks = useMemo(() => mergeCleaning(busyBlockInfo), [busyBlockInfo]);

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
  // Blok yang mulai tepat saat sesi pilihan berakhir — dipakai untuk menjawab
  // "setelah main ini, unit dipakai/dibersihkan sampai kapan".
  const nextBusy = endIso
    ? blocks.find((b) => Date.parse(b.from) === Date.parse(endIso))
    : undefined;

  return (
    <div className="space-y-3">
      {/* Ringkasan: jawaban cepat sebelum orang memindai 24 kotak.
          `aria-live` supaya screen readermemberi tahu ketika hitungan berubah
          (unit/durasi baru dimuat) — tanpa itu, perubahan hanya terlihat. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm">
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

      {/* Ringkasan jadwal unit hari ini. Menjawab "jam sekian sampai sekian
          sudah dipesan, kapan kosongnya, kapan dibersihkannya" tanpa harus
          menebak dari kotak bertanda garis miring. */}
      {blocks.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-low px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Jadwal unit ini
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            {blocks.slice(0, MAX_SUMMARY).map((b) => {
              const Icon = b.kind === "CLEANING" ? Sparkles : Lock;
              return (
                <li
                  key={`${b.kind}-${b.from}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1"
                >
                  <Icon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                  <span className="font-medium tabular-nums">
                    {fmtTime(b.from)}–{fmtTime(b.until)}
                  </span>
                  <span className="text-muted-foreground">
                    {b.kind === "CLEANING" ? "dibersihkan" : "dipesan"}
                  </span>
                  {b.freeAt !== b.until && (
                    <>
                      <span aria-hidden className="text-muted-foreground/50">·</span>
                      <span className="text-muted-foreground">
                        kosong <span className="font-medium tabular-nums text-foreground">{fmtTime(b.freeAt)}</span>
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {blocks.length > MAX_SUMMARY && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              +{blocks.length - MAX_SUMMARY} jadwal lain hari ini (di bawah).
            </p>
          )}
        </div>
      )}

      {/* Grup radiogroup: satu container untuk seluruh jam, dengan
          aria-describedby yang menunjuk ke catatan ketersediaan — jadi
          pengguna screen reader tahu ketersediaan bisa berubah.
          Per-period hanya pengelompokan visual, bukan grup ARIA terpisah:
          screen reader tetap membaca daftar jam sebagai satu pilihan. */}
      <div
        role="radiogroup"
        aria-label="Pilih jam mulai"
        aria-describedby="slot-availability-hint"
        onKeyDown={onKeyDown}
        className="space-y-4"
      >
        {groups.map((g) => (
          <div key={g.period}>
            <p aria-hidden className="mb-1.5 text-xs font-medium text-muted-foreground">
              {g.period}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.items.map((s) => {
                const open = isFree(s);
                const isPicked = s.slot_start === startIso && open;
                const isCovered = covered.has(s.slot_start);
                const ui = SLOT_UI[s.state] ?? { label: s.state.toLowerCase(), Icon: Lock };
                const Icon = ui.Icon;
                const time = fmtTime(s.slot_start);
                const busy = busyBySlot.get(s.slot_start);
                // Kotak yang terpakai menyebut kapan bloknya selesai, bukan
                // sekadar "Dipesan": itu yang dicari orang saat memilih jam.
                const note = isPicked
                  ? "Dipilih"
                  : isCovered
                    ? "Ikut terpakai"
                    : busy
                      ? `${busy.kind === "CLEANING" ? "bersih" : "s/d"} ${fmtTime(busy.until)}`
                      : ui.label;
                const detail = busy
                  ? `${fmtTime(busy.from)}–${fmtTime(busy.until)} ${busy.kind === "CLEANING" ? "dibersihkan" : "dipesan"}`
                  : note;

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
                    aria-label={`${time}, ${isCovered ? "ikut terpakai" : detail}`}
                    title={detail}
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

      {/* Legenda hanya untuk status yang benar-benar muncul, dengan bentuk yang sama
          seperti kotaknya. Dibaca screen reader sebagai daftar keterangan status. */}
      <ul
        aria-label="Keterangan status jam"
        className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
      >
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
        <div role="status" aria-live="polite" className="space-y-1 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <p>
            Kamu main <span className="font-medium">{fmtTime(picked.slot_start)}</span> sampai{" "}
            <span className="font-medium">{fmtTime(endIso)}</span>
            {crossesMidnight ? " (hari berikutnya)" : ""}, {fmtDuration(durationMinutes)}.
          </p>
          {nextBusy && (
            <p className="text-xs text-muted-foreground">
              Setelah itu unit{" "}
              {nextBusy.kind === "CLEANING"
                ? `dibersihkan sampai ${fmtTime(nextBusy.until)}`
                : `sudah dipesan ${fmtTime(nextBusy.from)}–${fmtTime(nextBusy.until)}`}
              {nextBusy.freeAt !== nextBusy.until ? `, kosong lagi ${fmtTime(nextBusy.freeAt)}` : ""}.
            </p>
          )}
        </div>
      )}

      <p
        id="slot-availability-hint"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
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