"use client";

import { PageHero } from "@/components/page-hero";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Gamepad2,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  ShieldCheck,
  Smartphone,
  Ticket,
  Timer,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ErrorKind = "wrong_digits" | "not_found" | "limited" | "invalid" | "server" | "network";
type Phase = "idle" | "loading" | "success";

const WA_NUMBER = "6281398765432";
const WA_DISPLAY = "0813-9876-5432";
const DEFAULT_LOCK_SECONDS = 60;
const MAX_LOCK_SECONDS = 3_600;

// Dibuat longgar: format kode bisa berubah, yang penting bukan sampah.
const normalizeCode = (v: string) => v.toUpperCase().replace(/\s+/g, "");
const isCodeShape = (v: string) => /^[A-Z0-9][A-Z0-9-]{3,29}$/.test(v);

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const FAQ: { q: string; a: string }[] = [
  {
    q: "Kode booking ada di mana?",
    a: "Di pesan WhatsApp konfirmasi dan di screenshot tiket yang kamu terima setelah booking. Formatnya diawali “SR-”.",
  },
  {
    q: "Nomor telepon saya ganti, bagaimana?",
    a: "Pakai nomor yang kamu isi saat booking, bukan nomor yang sekarang. Kalau sudah tidak bisa dipakai, hubungi kasir untuk verifikasi manual.",
  },
  {
    q: "Kenapa saya diminta menunggu?",
    a: "Percobaan salah yang berulang dibatasi sementara untuk menjaga tiket tetap aman. Tunggu hitungan mundurnya habis, atau langsung chat kasir.",
  },
];

/**
 * Verification checkpoint for the ticket. Knowing the booking code is no
 * longer enough — the customer proves ownership by answering the last 4
 * digits of the phone on the booking; a correct answer mints the httpOnly
 * access cookie that unlocks `/tiket/[code]`.
 */
export default function CekBookingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [attemptedCode, setAttemptedCode] = useState("");
  const [wrongCount, setWrongCount] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [fromUrl, setFromUrl] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(0);

  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const codeRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const last4 = digits.join("");
  const codeOk = isCodeShape(code);
  const digitsOk = last4.length === 4;
  const locked = lockUntil > now;
  const secondsLeft = locked ? Math.ceil((lockUntil - now) / 1_000) : 0;
  const step = phase === "success" ? 3 : codeOk && digitsOk ? 3 : codeOk ? 2 : 1;

  // Tiket redirects here with ?code=… whenever the access cookie is missing or
  // stale — so the visitor never retypes the code. Land the cursor on the digits.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("code");
    if (!fromQuery) return;
    const c = normalizeCode(fromQuery);
    setCode(c);
    if (isCodeShape(c)) {
      setFromUrl(true);
      requestAnimationFrame(() => boxes.current[0]?.focus());
    }
  }, []);

  // Ticker hanya hidup selama terkunci.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [locked]);

  useEffect(
    () => () => {
      if (stallTimer.current) clearTimeout(stallTimer.current);
    },
    [],
  );

  /* ------------------------------ kotak digit ------------------------------ */

  function fillFrom(index: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (!v) {
      setDigits((d) => d.map((x, i) => (i === index ? "" : x)));
      return;
    }
    const next = [...digits];
    v.split("")
      .slice(0, 4 - index)
      .forEach((ch, k) => {
        next[index + k] = ch;
      });
    setDigits(next);
    boxes.current[Math.min(index + v.length, 3)]?.focus();
  }

  function onDigitKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      setDigits((d) => d.map((x, k) => (k === i - 1 ? "" : x)));
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      boxes.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 3) {
      boxes.current[i + 1]?.focus();
    }
  }

  function onDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!text) return;
    const next = ["", "", "", ""];
    text.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setDigits(next);
    boxes.current[Math.min(text.length, 3)]?.focus();
  }

  /* -------------------------------- submit -------------------------------- */

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    if (!codeOk) {
      setError("invalid");
      codeRef.current?.focus();
      return;
    }
    if (!digitsOk) {
      setError("invalid");
      boxes.current[digits.findIndex((d) => !d)]?.focus();
      return;
    }
    // A ref, not just `phase`: two quick taps can both read "idle" before the first
    // setPhase has re-rendered.
    if (inFlight.current || locked) return;

    inFlight.current = true;
    setPhase("loading");
    setAttemptedCode(code);
    setError(null);

    let navigating = false;
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code)}?last4=${last4}`, {
        cache: "no-store",
      });

      if (res.ok) {
        // Stay locked on success: re-enabling the button while router.push is still
        // resolving is how one customer ends up verifying twice.
        navigating = true;
        setPhase("success");
        router.push(`/tiket/${encodeURIComponent(code)}`);
        // If navigation stalls, give the form back rather than strand the customer.
        stallTimer.current = setTimeout(() => {
          setPhase("idle");
          inFlight.current = false;
        }, 10_000);
        return;
      }

      if (res.status === 401) {
        setError("wrong_digits");
        setWrongCount((n) => n + 1);
        setDigits(["", "", "", ""]);
        setShakeKey((k) => k + 1);
        boxes.current[0]?.focus();
      } else if (res.status === 404) {
        setError("not_found");
      } else if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        const seconds =
          Number.isFinite(retry) && retry > 0 ? Math.min(retry, MAX_LOCK_SECONDS) : DEFAULT_LOCK_SECONDS;
        const t = Date.now();
        setNow(t);
        setLockUntil(t + seconds * 1_000);
        setError("limited");
      } else {
        setError("server");
      }
    } catch {
      setError("network");
    } finally {
      if (!navigating) {
        setPhase("idle");
        inFlight.current = false;
      }
    }
  }

  const waHref = useMemo(() => {
    const text = code
      ? `Halo kasir, saya butuh bantuan verifikasi booking ${code}.`
      : "Halo kasir, saya butuh bantuan mengecek booking saya.";
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  }, [code]);

  const busy = phase !== "idle";
  const showDigitHint = submitted && !digitsOk;
  const showCodeHint = submitted && !codeOk;

  const steps = [
    { n: 1, label: "Kode", done: codeOk },
    { n: 2, label: "Verifikasi", done: digitsOk },
    { n: 3, label: "Buka tiket", done: phase === "success" },
  ];

  return (
    <div className="relative isolate overflow-hidden">
      <style>{`
        @keyframes cek-shake { 10%,90%{transform:translateX(-2px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-6px)} 40%,60%{transform:translateX(6px)} }
        @keyframes cek-float { 0%,100%{transform:translateY(0) rotate(var(--r))} 50%{transform:translateY(-10px) rotate(var(--r))} }
        @media (prefers-reduced-motion: no-preference) {
          .cek-shake{animation:cek-shake .45s cubic-bezier(.36,.07,.19,.97) both}
          .cek-float{animation:cek-float 6s ease-in-out infinite}
        }
      `}</style>

      {/* dekorasi latar */}
      <div aria-hidden className="absolute -right-24 -top-28 -z-10 size-96 rounded-full bg-primary/20 blur-3xl" />
      <div aria-hidden className="absolute -left-24 top-1/2 -z-10 size-80 rounded-full bg-amber/10 blur-3xl" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      />
      <Gamepad2
        aria-hidden
        style={{ "--r": "-14deg" } as React.CSSProperties}
        className="cek-float absolute right-[6%] top-24 -z-10 hidden size-24 -rotate-12 text-primary opacity-[0.12] md:block"
      />
      <Zap
        aria-hidden
        style={{ "--r": "12deg" } as React.CSSProperties}
        className="cek-float absolute left-[5%] top-44 -z-10 hidden size-16 rotate-12 text-amber opacity-[0.15] [animation-delay:1.2s] md:block"
      />

      <div className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-16">
        {/* ============================ HEADER ============================ */}
        <PageHero
          chrome="bare"
          align="center"
          size="display"
          eyebrow={{
            label: (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                <ShieldCheck aria-hidden className="size-4" /> Portal Pelanggan
              </>
            ),
          }}
          title={
            <>
              Cek Status <span className="text-primary">Booking</span>
            </>
          }
          description="Masukkan kode booking dan verifikasi kepemilikan untuk melihat tiket, rincian unit, dan countdown pembayaran."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:items-start">
          {/* ========================= TIKET PREVIEW ======================== */}
          <aside className="order-2 space-y-5 lg:order-1 lg:sticky lg:top-24">
            <div
              aria-hidden
              className={cn(
                "relative overflow-hidden rounded-2xl border bg-card shadow-lg transition-all duration-500",
                phase === "success" ? "border-primary shadow-primary/20" : "border-border",
              )}
            >
              <div className="absolute -right-10 -top-12 size-40 rounded-full bg-primary/15 blur-3xl" />

              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    <Ticket className="size-3.5 text-primary" /> Tiket Booking
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
                      phase === "success"
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-amber/40 bg-amber/10 text-amber",
                    )}
                  >
                    {phase === "success" ? "Terverifikasi" : "Menunggu verifikasi"}
                  </span>
                </div>

                <p className="mt-5 text-[10px] uppercase tracking-widest text-muted-foreground">Kode</p>
                <p
                  className={cn(
                    "font-display text-3xl uppercase tracking-widest transition-colors md:text-4xl",
                    code ? "text-foreground" : "text-muted-foreground/40",
                  )}
                >
                  {code || "SR-••••-••••"}
                </p>
              </div>

              {/* garis sobekan + takik */}
              <div className="relative">
                <span className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                <span className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                <div className="mx-6 border-t-2 border-dashed border-border" />
              </div>

              <div className="p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Nomor telepon</p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-lg tracking-wider">
                      <Smartphone className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground/50">•••• ••••</span>
                      <span className={cn(digitsOk ? "text-primary" : "text-foreground")}>
                        {digits.map((d) => d || "•").join("")}
                      </span>
                    </p>
                  </div>
                  <Lock
                    className={cn("size-6 transition-colors", phase === "success" ? "text-primary" : "text-muted-foreground/40")}
                  />
                </div>
                {/* barcode dekoratif */}
                <div
                  className="mt-4 h-9 text-foreground opacity-60"
                  style={{
                    backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px, currentColor 5px 6px, transparent 6px 10px)",
                  }}
                />
              </div>
            </div>

            {/* keunggulan */}
            <ul className="grid grid-cols-3 gap-2 text-center">
              {[
                { icon: ShieldCheck, t: "Aman", d: "Hanya pemilik yang bisa buka" },
                { icon: Timer, t: "Cepat", d: "Cukup 2 isian" },
                { icon: Clock, t: "24 jam", d: "Kasir selalu standby" },
              ].map(({ icon: Icon, t, d }) => (
                <li key={t} className="rounded-xl border border-border bg-card/70 p-3">
                  <Icon aria-hidden className="mx-auto size-5 text-primary" />
                  <p className="mt-1.5 text-xs font-bold uppercase tracking-wide">{t}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{d}</p>
                </li>
              ))}
            </ul>
          </aside>

          {/* ============================ FORM ============================= */}
          <div className="order-1 lg:order-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              {/* stepper */}
              <ol className="mb-6 flex items-center gap-2" aria-label="Langkah">
                {steps.map((s, i) => (
                  <li key={s.n} className="flex flex-1 items-center gap-2" aria-current={step === s.n ? "step" : undefined}>
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors",
                        s.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : step === s.n
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {s.done ? <Check aria-hidden className="size-3.5" /> : s.n}
                    </span>
                    <span className={cn("hidden text-xs font-medium sm:inline", step >= s.n ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </span>
                    {i < steps.length - 1 && <span aria-hidden className={cn("h-px flex-1 transition-colors", s.done ? "bg-primary" : "bg-border")} />}
                  </li>
                ))}
              </ol>

              {/* noValidate: validasi dikerjakan di sini. Tanpa ini, atribut `pattern`
                  membuat browser memblokir submit dengan tooltip bawaan sebelum
                  verify() sempat menampilkan pesan kita. */}
              <form onSubmit={verify} noValidate className="space-y-5">
                {/* kode */}
                <div className="space-y-2">
                  <Label htmlFor="code">Kode Booking *</Label>
                  <div className="relative">
                    <Ticket aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="code"
                      ref={codeRef}
                      placeholder="Contoh: SR-2503-4412"
                      value={code}
                      onChange={(e) => {
                        setCode(normalizeCode(e.target.value));
                        setFromUrl(false);
                      }}
                      className="h-13 pl-11 pr-10 font-display uppercase tracking-widest"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      aria-invalid={showCodeHint}
                      aria-describedby="code-hint"
                      disabled={busy}
                    />
                    {codeOk && <CircleCheck aria-hidden className="absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-primary" />}
                  </div>
                  <p id="code-hint" className={cn("text-xs", showCodeHint ? "text-danger" : "text-muted-foreground")}>
                    {showCodeHint
                      ? "Isi kode booking dengan benar (huruf, angka, dan strip)."
                      : fromUrl
                        ? "Kode terisi otomatis dari tiketmu. Tinggal verifikasi nomor."
                        : "Kode booking ada di pesan WhatsApp atau screenshot tiket."}
                  </p>
                </div>

                {/* 4 digit */}
                <div className="space-y-2">
                  <Label id="last4-label">4 digit terakhir nomor telepon *</Label>
                  <div
                    key={shakeKey}
                    role="group"
                    aria-labelledby="last4-label"
                    aria-describedby="last4-hint"
                    className={cn("flex gap-2.5", shakeKey > 0 && error === "wrong_digits" && "cek-shake")}
                  >
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          boxes.current[i] = el;
                        }}
                        value={d}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        maxLength={4}
                        disabled={busy}
                        aria-label={`Digit ${i + 1} dari 4`}
                        aria-invalid={showDigitHint && !d}
                        onChange={(e) => fillFrom(i, e.target.value)}
                        onKeyDown={(e) => onDigitKey(i, e)}
                        onPaste={onDigitPaste}
                        onFocus={(e) => e.currentTarget.select()}
                        className={cn(
                          "h-16 w-full min-w-0 rounded-xl border bg-background text-center font-display text-3xl tabular-nums outline-none transition-all",
                          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40",
                          d ? "border-primary/60 bg-primary/5" : "border-input",
                          showDigitHint && !d && "border-danger/60",
                          "disabled:opacity-60",
                        )}
                      />
                    ))}
                  </div>
                  <p id="last4-hint" className={cn("text-xs", showDigitHint ? "text-danger" : "text-muted-foreground")}>
                    {showDigitHint
                      ? "Lengkapi 4 digit terakhir nomor telepon."
                      : "Nomor telepon yang kamu pakai saat booking. Ini menjaga tiket tetap milikmu meski kode tersebar."}
                  </p>
                </div>

                {/* error */}
                <div aria-live="polite">
                  {error && error !== "not_found" && error !== "invalid" && (
                    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4">
                      <div className="flex items-start gap-3">
                        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                        <div className="min-w-0 flex-1">
                          {error === "wrong_digits" && (
                            <>
                              <p className="font-display text-lg uppercase">Verifikasi Gagal</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                4 digit terakhir tidak cocok dengan nomor pada booking{" "}
                                <strong className="text-foreground">{attemptedCode}</strong>. Cek lagi, ya — pakai nomor
                                yang dipakai <em>saat booking</em>.
                              </p>
                              {wrongCount >= 2 && (
                                <p className="mt-2 text-xs text-amber">
                                  Percobaan berulang bisa diblokir sementara. Kalau ragu, chat kasir saja.
                                </p>
                              )}
                            </>
                          )}
                          {error === "limited" && (
                            <>
                              <p className="font-display text-lg uppercase">Terlalu Banyak Percobaan</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {locked ? (
                                  <>
                                    Coba lagi dalam{" "}
                                    <strong className="tabular-nums text-foreground">{mmss(secondsLeft)}</strong>. Kalau
                                    terus terblokir, hubungi kasir untuk verifikasi manual.
                                  </>
                                ) : (
                                  "Waktu tunggu selesai. Kamu bisa mencoba lagi sekarang."
                                )}
                              </p>
                            </>
                          )}
                          {error === "server" && (
                            <>
                              <p className="font-display text-lg uppercase">Terjadi Kesalahan</p>
                              <p className="mt-1 text-sm text-muted-foreground">Server sedang bermasalah. Coba beberapa saat lagi.</p>
                            </>
                          )}
                          {error === "network" && (
                            <>
                              <p className="font-display text-lg uppercase">Tidak Ada Koneksi</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Tidak bisa menjangkau server. Cek internetmu lalu coba lagi.
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {error === "invalid" && (
                    <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                      <TriangleAlert aria-hidden className="size-4 shrink-0" />
                      Isi kode booking dan 4 digit terakhir nomor telepon, ya.
                    </p>
                  )}

                  {error === "not_found" && (
                    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4">
                      <p className="font-display text-lg uppercase">Booking Tidak Ditemukan</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Kami belum menemukan booking dengan kode{" "}
                        <strong className="text-foreground">{attemptedCode}</strong>. Periksa lagi huruf dan angkanya.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button asChild variant="outline" size="sm">
                          <a href={waHref} target="_blank" rel="noreferrer noopener">
                            <MessageCircle aria-hidden className="mr-1.5 size-4" /> Tanya kasir
                          </a>
                        </Button>
                        <Button asChild size="sm">
                          <a href="/booking">
                            <Plus aria-hidden className="mr-1.5 size-4" /> Buat Booking Baru
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* submit */}
                <Button
                  type="submit"
                  className="group h-14 w-full text-base font-bold transition-transform active:scale-[0.98]"
                  disabled={busy || locked}
                  aria-busy={busy}
                >
                  {phase === "success" ? (
                    <>
                      <CircleCheck aria-hidden className="mr-2 size-5" /> Terverifikasi — membuka tiket…
                    </>
                  ) : phase === "loading" ? (
                    <>
                      <Loader2 aria-hidden className="mr-2 size-5 animate-spin" /> Memeriksa…
                    </>
                  ) : locked ? (
                    <>
                      <Timer aria-hidden className="mr-2 size-5" /> Coba lagi dalam {mmss(secondsLeft)}
                    </>
                  ) : (
                    <>
                      Cek Booking
                      <ArrowRight aria-hidden className="ml-2 size-5 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>

        {/* ============================ BANTUAN ============================ */}
        <section className="mt-12 grid gap-6 md:grid-cols-[1fr_1.2fr]">
          <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5">
            <div aria-hidden className="absolute -right-8 -top-10 -z-10 size-36 rounded-full bg-primary/15 blur-3xl" />
            <p className="inline-flex items-center gap-2 font-display text-lg uppercase">
              <MessageCircle aria-hidden className="size-5 text-primary" /> Butuh bantuan?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Kasir standby 24 jam untuk verifikasi manual. Kode booking otomatis ikut terkirim kalau sudah kamu isi.
            </p>
            <Button asChild className="mt-4 w-full sm:w-auto">
              <a href={waHref} target="_blank" rel="noreferrer noopener">
                <MessageCircle aria-hidden className="mr-2 size-4" /> Chat Kasir · {WA_DISPLAY}
              </a>
            </Button>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-lg uppercase">Sering ditanyakan</h2>
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-card px-4 py-3 open:border-primary/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}