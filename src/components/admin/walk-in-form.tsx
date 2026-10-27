"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  CircleCheck,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  Landmark,
  Loader2,
  Lock,
  Phone,
  QrCode,
  Tag,
  TriangleAlert,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { UNIT_LABEL, UNIT_TONE, fmtDateTime, rp } from "@/lib/format";
import { eligibleOfferings, savingOf, type PromoOffering } from "@/lib/promo-rules";
import { cn } from "@/lib/utils";

type Branch = { id: string; name: string };
type Unit = {
  id: string;
  name: string;
  branchId: string;
  status: string;
  /** Needed to decide which promos apply — a promo is priced for one type of room. */
  facilityTypeId: string;
};

type PayMethod = "CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL";
type Created = { code: string; total: number; status: string };

const DURATIONS = [60, 120, 180, 240, 300, 360];

const PAY: { value: PayMethod; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "Tunai", icon: Banknote },
  { value: "QRIS_MANUAL", label: "QRIS", icon: QrCode },
  { value: "TRANSFER_MANUAL", label: "Transfer", icon: Landmark },
];

const DOT: Record<string, string> = {
  success: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  neutral: "bg-muted-foreground/50",
};

const isDown = (status: string) => status === "MAINTENANCE" || status === "OFFLINE";

/* ---- waktu: dikunci ke WIB, bukan timezone browser ---------------------- */
// <input type="datetime-local"> has no zone. The old code handed it to `new Date()`,
// i.e. the browser's zone, so a laptop set to another timezone booked at the wrong
// hour. The lounge runs on WIB, and so do the date filters on the Bookings page.
const WIB_MS = 7 * 3_600_000;
const wibInputValue = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 16);
const parseWib = (v: string) => (v.length === 16 ? Date.parse(`${v}:00+07:00`) : Number.NaN);
const nextQuarterHour = () => Math.ceil(Date.now() / 900_000) * 900_000;

/** Buang spasi, strip, dan kurung — cara orang menulis nomor, bukan bagian dari nomornya. */
const normalizePhone = (raw: string) => raw.replace(/[\s().-]/g, "");
const phoneOk = (v: string) => /^\+?\d{8,15}$/.test(v);

export function WalkInForm({
  branches,
  units,
  promoOfferings = [],
  branchLocked = false,
}: {
  branches: Branch[];
  units: Unit[];
  promoOfferings?: PromoOffering[];
  /** The page already narrowed the branch list for pinned profiles; this shows it. */
  branchLocked?: boolean;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [duration, setDuration] = useState(60);
  const [promotionId, setPromotionId] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [mode, setMode] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ name: false, phone: false });

  const submitting = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const branchUnits = useMemo(() => units.filter((u) => u.branchId === branchId), [units, branchId]);
  const selectedUnit = branchUnits.find((u) => u.id === unitId) ?? null;

  // The same eligibility the customer form uses, on the same list: a promo that is not
  // offered here would only fail at the RPC, after the cashier filled the form in.
  const promoOptions = useMemo(
    () =>
      eligibleOfferings(promoOfferings, {
        branchId,
        facilityTypeId: selectedUnit?.facilityTypeId ?? null,
        durationMinutes: duration,
      }),
    [promoOfferings, branchId, selectedUnit, duration],
  );
  const activePromo = promoOptions.find((o) => o.promotion_id === promotionId) ?? null;
  // What actually goes over the wire. `promotionId` can outlive its eligibility (pick a
  // promo, then switch to a room type it does not cover): the old form kept sending that
  // stale id while the UI showed "no promo".
  const effectivePromoId = activePromo?.promotion_id ?? "";

  /* ---- validasi ---- */
  const cleanPhone = normalizePhone(phone);
  const nameValid = name.trim().length >= 2;
  const phoneValid = phoneOk(cleanPhone);
  const startMs = mode === "later" ? parseWib(startAt) : null;
  const startValid = mode === "now" || (startMs !== null && !Number.isNaN(startMs));
  const startInPast = startMs !== null && !Number.isNaN(startMs) && startMs < Date.now() - 5 * 60_000;
  const canSubmit = !busy && Boolean(unitId) && nameValid && phoneValid && startValid;

  const unitBusyNow =
    mode === "now" && selectedUnit && (selectedUnit.status === "IN_USE" || selectedUnit.status === "BOOKED");

  function selectBranch(id: string) {
    setBranchId(id);
    setUnitId("");
    setPromotionId("");
  }

  function selectUnit(id: string) {
    setUnitId(id);
    // A promo is priced per room type: switching unit must not carry the old pick along.
    setPromotionId("");
  }

  function selectDuration(minutes: number) {
    setDuration(minutes);
    setPromotionId("");
  }

  function chooseMode(next: "now" | "later") {
    setMode(next);
    if (next === "later" && !startAt) setStartAt(wibInputValue(nextQuarterHour()));
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // clipboard can be blocked on insecure origins; the code is on screen anyway
    }
  }

  function showFeedback() {
    // The form is tall: without this the result lands below the fold on a tablet.
    requestAnimationFrame(() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, phone: true });
    // A ref, not just `busy`: two quick taps can both read busy === false before the
    // first setBusy has re-rendered, and the result is two real bookings.
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          unit_id: unitId,
          customer_name: name.trim(),
          customer_phone: cleanPhone,
          duration_minutes: duration,
          pay_method: payMethod,
          ...(effectivePromoId ? { promotion_id: effectivePromoId } : {}),
          ...(startMs !== null ? { start_at: new Date(startMs).toISOString() } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal membuat walk-in");
        showFeedback();
        return;
      }
      if (!body?.booking) {
        setError("Respons server tidak terduga. Cek halaman Bookings sebelum mencoba lagi.");
        showFeedback();
        return;
      }
      setResult({ code: body.booking.booking_code, total: body.booking.total_amount, status: body.booking.status });
      setCopied(false);
      // Customer + unit are per-walk-in; branch, duration and payment method usually
      // repeat from one customer to the next, so they stay.
      setUnitId("");
      setName("");
      setPhone("");
      setPromotionId("");
      setMode("now");
      setStartAt("");
      setTouched({ name: false, phone: false });
      showFeedback();
      router.refresh();
    } catch {
      // The request may have reached the server before the connection dropped, so
      // "try again" is the wrong advice here — it is how one customer gets two bookings.
      setError("Koneksi terputus saat mengirim. Cek halaman Bookings dulu: booking mungkin sudah terbuat. Jangan kirim ulang sebelum memastikan.");
      showFeedback();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const stepHeader = (n: number, title: string, hint?: string) => (
    <div className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
      <div className="min-w-0">
        <h2 className="font-display text-lg uppercase leading-none">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  const radioCard = (active: boolean, disabled?: boolean) =>
    cn(
      "rounded-xl border p-3 text-left transition-all",
      active ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border bg-background/60 hover:border-primary/50",
      disabled && "cursor-not-allowed opacity-45 hover:border-border",
    );

  const checklist = [
    { ok: Boolean(unitId), text: "Pilih unit" },
    { ok: nameValid, text: "Nama pelanggan" },
    { ok: phoneValid, text: "No. WhatsApp valid" },
    { ok: startValid, text: "Waktu mulai valid" },
  ];

  return (
    <div className="space-y-4">
      {/* Hasil / error di atas form, dengan aria-live supaya terbaca pembaca layar. */}
      <div ref={feedbackRef} aria-live="polite" className="space-y-3">
        {result && (
          <section className="relative isolate overflow-hidden rounded-2xl border border-primary/40 bg-primary/10 p-4">
            <div aria-hidden className="absolute -left-10 top-0 -z-10 size-40 rounded-full bg-primary/20 blur-3xl" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
                  <CircleCheck aria-hidden className="size-6" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">Booking dibuat</p>
                  <p className="font-display text-2xl uppercase leading-tight tracking-wide">{result.code}</p>
                  <p className="text-sm text-muted-foreground">
                    <b className="tabular-nums text-foreground">{rp(result.total)}</b> · {result.status}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={copyCode} className="gap-1.5">
                  {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                  {copied ? "Tersalin" : "Salin kode"}
                </Button>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/tiket/${result.code}`}>
                    <ExternalLink aria-hidden className="size-3.5" /> Buka tiket
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  aria-label="Tutup"
                  className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            </div>
          </section>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_19rem] lg:items-start">
        {/* ============================ KIRI ============================ */}
        <div className="space-y-6">
          {/* 1. Unit */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            {stepHeader(1, "Unit", "Pilih unit yang akan dipakai customer.")}

            {branches.length > 1 && !branchLocked ? (
              <div className="space-y-2">
                <Label htmlFor="wi-branch">Cabang</Label>
                <SelectField id="wi-branch" value={branchId} onChange={(e) => selectBranch(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : (
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium">
                <Lock aria-hidden className="size-3.5 text-muted-foreground" />
                {branches.find((b) => b.id === branchId)?.name ?? "—"}
                {branchLocked && <span className="text-muted-foreground">· dikunci sesuai penempatan profilmu</span>}
              </p>
            )}

            {branchUnits.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Tidak ada unit rental di cabang ini.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Pilih unit" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {branchUnits.map((u) => {
                  const down = isDown(u.status);
                  const active = u.id === unitId;
                  const tone = UNIT_TONE[u.status] ?? "neutral";
                  return (
                    <button
                      key={u.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={down}
                      onClick={() => selectUnit(u.id)}
                      className={cn(radioCard(active, down), "flex min-h-14 flex-col justify-center gap-0.5")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{u.name}</span>
                        {active && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span aria-hidden className={cn("size-2 rounded-full", DOT[tone])} />
                        {UNIT_LABEL[u.status] ?? u.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 2. Customer */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            {stepHeader(2, "Customer", "Nomor WhatsApp dipakai untuk tiket dan notifikasi.")}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wi-name">Nama</Label>
                <div className="relative">
                  <User aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="wi-name"
                    value={name}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    aria-invalid={touched.name && !nameValid}
                    className="pl-9"
                  />
                </div>
                {touched.name && !nameValid && <p className="text-xs text-coral">Minimal 2 karakter.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wi-phone">No. WhatsApp</Label>
                <div className="relative">
                  <Phone aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="wi-phone"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="08xx xxxx xxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    aria-invalid={touched.phone && !phoneValid}
                    className="pl-9"
                  />
                </div>
                {touched.phone && !phoneValid && (
                  <p className="text-xs text-coral">Nomor harus 8–15 digit (spasi dan strip boleh).</p>
                )}
              </div>
            </div>
          </section>

          {/* 3. Waktu & promo */}
          <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
            {stepHeader(3, "Waktu & Promo")}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Durasi</Label>
                {activePromo && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber">
                    <Lock aria-hidden className="size-3" /> Dikunci promo — pilih “Tanpa promo” untuk mengubah
                  </span>
                )}
              </div>
              <div role="radiogroup" aria-label="Durasi" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={duration === d}
                    // A promo package is priced for one duration, so it pins this while
                    // active; clearing the promo is the way to choose another length.
                    disabled={Boolean(activePromo)}
                    onClick={() => selectDuration(d)}
                    className={cn(radioCard(duration === d, Boolean(activePromo) && duration !== d), "py-2.5 text-center")}
                  >
                    <span className="font-display text-lg tabular-nums">{d / 60}</span>
                    <span className="ml-1 text-xs text-muted-foreground">jam</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mulai</Label>
              <div role="radiogroup" aria-label="Waktu mulai" className="grid grid-cols-2 gap-2">
                <button type="button" role="radio" aria-checked={mode === "now"} onClick={() => chooseMode("now")} className={cn(radioCard(mode === "now"), "flex items-center gap-2 py-2.5")}>
                  <Clock aria-hidden className="size-4 text-primary" />
                  <span className="text-sm font-medium">Sekarang</span>
                </button>
                <button type="button" role="radio" aria-checked={mode === "later"} onClick={() => chooseMode("later")} className={cn(radioCard(mode === "later"), "flex items-center gap-2 py-2.5")}>
                  <Clock aria-hidden className="size-4 text-amber" />
                  <span className="text-sm font-medium">Jadwalkan</span>
                </button>
              </div>

              {mode === "later" && (
                <div className="space-y-2 rounded-xl border border-border bg-background/60 p-3">
                  <Input
                    id="wi-start"
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    aria-label="Waktu mulai (WIB)"
                    aria-invalid={!startValid}
                  />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      ["+30 mnt", 30],
                      ["+1 jam", 60],
                      ["+2 jam", 120],
                    ].map(([label, mins]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setStartAt(wibInputValue(Date.now() + Number(mins) * 60_000))}
                        className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                      >
                        {label}
                      </button>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">Zona waktu WIB</span>
                  </div>
                  {!startValid && <p className="text-xs text-coral">Isi tanggal dan jam mulai.</p>}
                  {startInPast && (
                    <p className="flex items-start gap-1.5 text-xs text-amber">
                      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      Waktu ini sudah lewat. Pastikan memang mencatat sesi yang sudah berjalan.
                    </p>
                  )}
                </div>
              )}
            </div>

            {unitId && promoOfferings.length > 0 && (
              <div className="space-y-2">
                <Label>Promo</Label>
                <div role="radiogroup" aria-label="Promo" className="grid gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!activePromo}
                    onClick={() => setPromotionId("")}
                    className={cn(radioCard(!activePromo), "flex items-center gap-2 text-sm")}
                  >
                    <Tag aria-hidden className="size-4 text-muted-foreground" /> Tanpa promo
                  </button>
                  {promoOptions.map((o) => {
                    const active = o.promotion_id === promotionId;
                    return (
                      <button
                        key={o.promotion_id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setPromotionId(o.promotion_id);
                          // Snap to the package length, the same way the customer form does.
                          setDuration(o.duration_minutes);
                        }}
                        className={radioCard(active)}
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{o.name}</span>
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                            hemat {rp(savingOf(o))}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {o.facility_name} · {o.duration_minutes / 60} jam ·{" "}
                          <b className="tabular-nums text-foreground">{rp(o.promo_price)}</b>
                        </span>
                        {o.bonus_snack_name && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber">
                            <Gift aria-hidden className="size-3" />
                            bonus {o.bonus_quantity}× {o.bonus_snack_name} (selama stok)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {promoOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Tidak ada promo untuk unit &amp; durasi ini.</p>
                )}
              </div>
            )}
          </section>

          {/* 4. Pembayaran */}
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            {stepHeader(4, "Pembayaran", "Dicatat manual oleh kasir — booking langsung CONFIRMED.")}
            <div role="radiogroup" aria-label="Bayar pakai" className="grid grid-cols-3 gap-2">
              {PAY.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={payMethod === value}
                  onClick={() => setPayMethod(value)}
                  className={cn(radioCard(payMethod === value), "flex flex-col items-center gap-1 py-3")}
                >
                  <Icon aria-hidden className={cn("size-5", payMethod === value ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* =========================== KANAN =========================== */}
        <aside className="space-y-3 lg:sticky lg:top-24">
          <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-4">
            <div aria-hidden className="absolute -right-10 -top-12 -z-10 size-40 rounded-full bg-primary/15 blur-3xl" />
            <h2 className="font-display text-lg uppercase">Ringkasan</h2>

            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Unit", selectedUnit?.name ?? "—"],
                ["Customer", name.trim() || "—"],
                ["WhatsApp", cleanPhone || "—"],
                ["Durasi", `${duration / 60} jam`],
                [
                  "Mulai",
                  mode === "now"
                    ? "Sekarang"
                    : startMs !== null && !Number.isNaN(startMs)
                      ? `${fmtDateTime(new Date(startMs).toISOString())}`
                      : "—",
                ],
                ["Bayar", PAY.find((p) => p.value === payMethod)?.label ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 border-t border-border pt-3">
              {activePromo ? (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Total promo</p>
                  <p className="font-display text-3xl leading-tight tabular-nums text-primary">{rp(activePromo.promo_price)}</p>
                  <p className="text-[11px] text-muted-foreground">{activePromo.name} · hemat {rp(savingOf(activePromo))}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
                  <p className="text-sm text-muted-foreground">Dihitung otomatis oleh sistem saat booking dibuat.</p>
                </>
              )}
            </div>

            {unitBusyNow && (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-amber/15 px-2 py-1.5 text-[11px] text-amber">
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Unit ini sedang {selectedUnit?.status === "IN_USE" ? "dipakai" : "dipesan"}. Mulai “Sekarang” kemungkinan
                bentrok — pilih unit lain atau jadwalkan.
              </p>
            )}

            <ul className="mt-3 space-y-1">
              {checklist.map((c) => (
                <li key={c.text} className={cn("flex items-center gap-2 text-xs", c.ok ? "text-primary" : "text-muted-foreground")}>
                  {c.ok ? <CircleCheck aria-hidden className="size-3.5" /> : <span aria-hidden className="size-3.5 rounded-full border border-border" />}
                  {c.text}
                </li>
              ))}
            </ul>

            <Button type="submit" className="mt-4 h-12 w-full gap-2 text-base font-bold" disabled={!canSubmit} aria-busy={busy}>
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CircleCheck aria-hidden className="size-4" />}
              {busy ? "Memproses…" : "Buat Walk-in + Confirm"}
            </Button>
          </section>
        </aside>
      </form>
    </div>
  );
}