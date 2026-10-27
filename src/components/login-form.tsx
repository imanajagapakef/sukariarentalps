"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin login, dressed as the console's lock screen.
 *
 * The page is one small state machine (idle / busy / error / success) and the whole scene
 * listens to it through a single `data-state` attribute on the root. The padlock on the TV
 * is the form's face: it breathes while you type, rattles amber while Supabase answers,
 * shakes red on a wrong password, and pops open with a burst when you are in. Everything is
 * CSS driven from that one attribute, so the logic below stays exactly what it was.
 *
 * Motion is CSS only and switched off under `prefers-reduced-motion`; the state is still
 * readable (colour, message, open or closed shackle) without it.
 */

type Status = "idle" | "busy" | "error" | "success";

const GOLD = "#ffb84d";

/** How long the "akses diterima" moment is shown before we navigate. */
const SUCCESS_MS = 900;

const CSS = `
.lg-grid{animation:lg-grid 4s linear infinite}
.lg-pulse{animation:lg-pulse 3s ease-in-out infinite}
.lg-float{animation:lg-float 5s ease-in-out infinite}
.lg-spark{animation:lg-rise linear infinite}
.lg-glyph{animation:lg-drift 7s ease-in-out infinite alternate}
.lg-orbit{animation:lg-spin 6s linear infinite}
.lg-shake{animation:lg-shake .5s cubic-bezier(.36,.07,.19,.97) both}
.lg-blink{animation:lg-blink 1s steps(2,end) infinite}
.lg-btnshine{animation:lg-shine 3.4s ease-in-out infinite}
.lg-twinkle{animation:lg-twinkle 1.8s ease-in-out infinite}

.lg-lock{transform-box:fill-box;transform-origin:50% 50%;animation:lg-breathe 3s ease-in-out infinite}
.lg-body{fill:#61e06a;transition:fill .25s}
.lg-stroke{stroke:#61e06a;transition:stroke .25s}
.lg-shackle{transform-box:fill-box;transform-origin:100% 100%;transition:transform .55s cubic-bezier(.3,1.6,.5,1)}
.lg-m{opacity:0;transition:opacity .2s}
.lg-ring{opacity:0;transform-box:fill-box;transform-origin:50% 50%}
.lg-flash{opacity:0}
.lg-pc{opacity:0}
.lg-seg i{opacity:0}

[data-state="busy"] .lg-lock{animation:lg-jiggle .3s ease-in-out infinite}
[data-state="busy"] .lg-body{fill:#ffb84d}
[data-state="busy"] .lg-stroke{stroke:#ffb84d}
[data-state="busy"] .lg-seg i{animation:lg-seg 1.1s ease-in-out infinite}

[data-state="error"] .lg-lock{animation:lg-lockerr .5s ease-in-out both}
[data-state="error"] .lg-body{fill:#ff6b6b}
[data-state="error"] .lg-stroke{stroke:#ff6b6b}
[data-state="error"] .lg-flash{animation:lg-flash .6s ease-out both}

[data-state="success"] .lg-lock{animation:lg-unlock .6s ease-out both}
[data-state="success"] .lg-shackle{transform:translateY(-10px) rotate(28deg)}
[data-state="success"] .lg-ring{animation:lg-ring 1s ease-out both}
[data-state="success"] .lg-pc{animation:lg-pc .9s ease-out both}
[data-state="success"] .lg-seg i{opacity:1}

[data-state="idle"] .lg-m-idle,[data-state="busy"] .lg-m-busy,[data-state="error"] .lg-m-error,[data-state="success"] .lg-m-success{opacity:1}

@keyframes lg-grid{to{transform:translateY(32px)}}
@keyframes lg-pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
@keyframes lg-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes lg-rise{0%{opacity:0;transform:translateY(0)}15%{opacity:.9}100%{opacity:0;transform:translateY(-70dvh)}}
@keyframes lg-drift{0%{transform:translate(0,0) rotate(-12deg)}100%{transform:translate(8px,-18px) rotate(14deg)}}
@keyframes lg-spin{to{transform:rotate(360deg)}}
@keyframes lg-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes lg-twinkle{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1.2)}}
@keyframes lg-shine{0%,55%{transform:translateX(-130%) skewX(-20deg)}100%{transform:translateX(330%) skewX(-20deg)}}
@keyframes lg-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
@keyframes lg-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes lg-jiggle{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes lg-lockerr{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}
@keyframes lg-unlock{0%{transform:scale(1)}40%{transform:scale(1.16)}100%{transform:scale(1)}}
@keyframes lg-flash{0%{opacity:.55}100%{opacity:0}}
@keyframes lg-ring{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(5)}}
@keyframes lg-pc{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
@keyframes lg-seg{0%,100%{opacity:.15}50%{opacity:1}}

@media (prefers-reduced-motion:reduce){
  .lg-root *,.lg-root *::before,.lg-root *::after{animation:none!important}
  .lg-ring,.lg-pc,.lg-flash{display:none}
}
`;

const SEGMENTS = Array.from({ length: 12 }, (_, i) => i);

const SPARKS = [
  { l: 6, s: 4, d: 0, t: 6.5, c: "#61e06a" },
  { l: 16, s: 3, d: 2.1, t: 8, c: GOLD },
  { l: 28, s: 5, d: 4.2, t: 7, c: "#8ab4ff" },
  { l: 40, s: 3, d: 1.2, t: 9, c: "#61e06a" },
  { l: 52, s: 4, d: 5.5, t: 6, c: GOLD },
  { l: 62, s: 3, d: 3.1, t: 8.5, c: "#8ab4ff" },
  { l: 72, s: 5, d: 0.8, t: 7.5, c: "#61e06a" },
  { l: 82, s: 3, d: 4.8, t: 6.8, c: GOLD },
  { l: 91, s: 4, d: 2.6, t: 9, c: "#8ab4ff" },
  { l: 97, s: 3, d: 6.2, t: 7.2, c: "#61e06a" },
];

/** Burst pieces that fly out of the padlock on success. */
const BURST = [
  { dx: -70, dy: -50, c: "#61e06a" },
  { dx: 70, dy: -54, c: GOLD },
  { dx: -84, dy: 6, c: "#8ab4ff" },
  { dx: 84, dy: 10, c: "#ff6b6b" },
  { dx: -56, dy: 48, c: GOLD },
  { dx: 58, dy: 50, c: "#61e06a" },
  { dx: -14, dy: -72, c: "#8ab4ff" },
  { dx: 18, dy: 62, c: "#ff6b6b" },
];

/** Only same-site paths are allowed as the post-login target, never `//evil.com` or a full URL. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/admin";
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [shakeKey, setShakeKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locked = status === "busy" || status === "success";

  // Focus the email field on desktop only: on a phone it would throw the keyboard over the
  // padlock before the person has seen the page.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      document.getElementById("email")?.focus();
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function touched() {
    if (status === "error") setStatus("idle");
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setStatus("busy");
    setError(null);
    const db = createClient();
    const { error: err } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setStatus("error");
      setShakeKey((k) => k + 1);
      setError(err.message === "Invalid login credentials" ? "Email atau password salah" : err.message);
      document.getElementById("password")?.focus();
      return;
    }
    setStatus("success");
    // A short beat so the padlock gets to open before the page changes under it.
    timer.current = setTimeout(() => router.replace(next), SUCCESS_MS);
  }

  return (
    <main
      data-state={status}
      className="lg-root relative min-h-dvh overflow-hidden bg-background"
    >
      <style>{CSS}</style>

      {/* ---------- Latar (dekoratif) ---------- */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            WebkitMaskImage: "radial-gradient(70% 60% at 50% 45%, #000 15%, transparent 78%)",
            maskImage: "radial-gradient(70% 60% at 50% 45%, #000 15%, transparent 78%)",
          }}
        >
          <div
            className="lg-grid absolute -inset-8"
            style={{
              backgroundImage:
                "linear-gradient(rgba(97,224,106,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(97,224,106,.07) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div
          className="lg-pulse absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(45% 50% at 28% 40%, rgba(32,168,58,0.30), transparent 70%), radial-gradient(35% 40% at 80% 70%, rgba(255,184,77,0.10), transparent 70%)",
          }}
        />

        {SPARKS.map((p, i) => (
          <span
            key={i}
            className="lg-spark absolute bottom-0 block"
            style={
              {
                left: `${p.l}%`,
                width: p.s,
                height: p.s,
                background: p.c,
                animationDuration: `${p.t}s`,
                animationDelay: `${p.d}s`,
                opacity: 0,
              } as CSSProperties
            }
          />
        ))}

        <svg className="lg-glyph absolute left-[5%] top-[12%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#61e06a" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M12 3 L22 20 H2 Z" />
        </svg>
        <svg className="lg-glyph absolute right-[6%] top-[14%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5" style={{ animationDelay: "-2s" }}>
          <circle cx="12" cy="12" r="9" />
        </svg>
        <svg className="lg-glyph absolute bottom-[10%] left-[8%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#8ab4ff" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "-4s" }}>
          <path d="M4 4 L20 20 M20 4 L4 20" />
        </svg>
        <svg className="lg-glyph absolute bottom-[12%] right-[7%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinejoin="round" style={{ animationDelay: "-5.5s" }}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        </svg>

        <div
          className="absolute inset-0 opacity-[.07]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, #000 0, #000 1px, transparent 1px, transparent 4px)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.55))" }}
        />
      </div>

      <div className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-4 px-4 py-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:py-10">
        {/* ================= Panel kiri: layar konsol ================= */}
        <section aria-hidden className="mx-auto flex w-full max-w-70 flex-col items-center sm:max-w-sm lg:max-w-130 lg:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, sized by CSS */}
          <img
            src="/brand/logo-primary.svg"
            alt=""
            className="mb-2 hidden w-44 lg:mb-6 lg:block"
            style={{ filter: "drop-shadow(0 0 16px rgba(97,224,106,.4))" }}
          />

          <div className="lg-float w-full">
            <ConsoleScene />
          </div>

          <div className="mt-4 hidden lg:block">
            <p className="font-display text-4xl uppercase leading-[1.05] text-on-surface xl:text-5xl">
              Ruang kendali
              <br />
              <span className="text-primary">Klub Sukaria</span>
            </p>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Atur booking, turnamen, dan menu snack dari satu tempat. Masuk dulu, baru gas.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {[
                ["Booking", "#61e06a"],
                ["Turnamen", GOLD],
                ["Snack", "#8ab4ff"],
              ].map(([label, color]) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-full border border-border bg-surface-low/70 px-3 py-1.5"
                >
                  <span className="size-2" style={{ background: color }} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ================= Panel kanan: form ================= */}
        <section className="mx-auto w-full max-w-sm">
          <div className="mb-4 flex items-center justify-center gap-2 lg:justify-start">
            <span className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              <span className="lg-blink size-1.5 rounded-full bg-primary" />
              Area Admin &amp; Staf
            </span>
          </div>

          <h1 className="font-display text-center text-4xl uppercase leading-none text-primary lg:text-left">
            Login Admin
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground lg:text-left">
            Khusus admin &amp; staf Klub Sukaria.
          </p>

          {/* Animated border: a light that circles the card. The card sits on top and leaves
              1.5px of the spinning gradient showing around its edge. */}
          <div
            key={shakeKey}
            className={`relative mt-6 overflow-hidden rounded-2xl p-[1.5px] shadow-[0_0_40px_-8px] shadow-primary/40 ${
              status === "error" ? "lg-shake" : ""
            }`}
          >
            <span
              aria-hidden
              className="lg-orbit absolute -inset-[80%]"
              style={{
                background: `conic-gradient(from 0deg, transparent 0 62%, ${
                  status === "error" ? "#ff6b6b" : "#61e06a"
                } 80%, ${status === "error" ? "#ff6b6b" : GOLD} 92%, transparent 100%)`,
              }}
            />
            <Card className="relative rounded-[14px] border-0 bg-card">
              <CardContent>
                <form onSubmit={login} className="space-y-4" noValidate={false}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        placeholder="nama@klubsukaria.id"
                        className="h-11 pl-10"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          touched();
                        }}
                        disabled={locked}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="h-11 pl-10 pr-11"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          touched();
                        }}
                        onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
                        onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
                        onBlur={() => setCaps(false)}
                        disabled={locked}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                        aria-pressed={showPw}
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-low hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {caps && (
                      <p className="flex items-center gap-1.5 text-xs" style={{ color: GOLD }}>
                        <AlertTriangle aria-hidden className="size-3.5" />
                        Caps Lock lagi nyala
                      </p>
                    )}
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      {error}
                    </p>
                  )}

                  <div>
                    <Button
                      type="submit"
                      disabled={locked}
                      className="group relative h-11 w-full overflow-hidden text-sm font-bold uppercase tracking-[0.18em] shadow-[0_0_24px_-6px] shadow-primary/60"
                    >
                      {/* sweeping shine on the idle button */}
                      {status === "idle" && (
                        <span
                          aria-hidden
                          className="lg-btnshine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-white/25"
                        />
                      )}
                      <span className="relative flex items-center justify-center gap-2">
                        {status === "busy" && (
                          <>
                            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
                            Memeriksa…
                          </>
                        )}
                        {status === "success" && (
                          <>
                            <Check aria-hidden className="size-4" />
                            Akses diterima
                          </>
                        )}
                        {(status === "idle" || status === "error") && "Masuk"}
                      </span>
                    </Button>

                    {/* segmented progress, same language as the loading screen */}
                    <div aria-hidden className="mt-2 flex gap-0.75">
                      {SEGMENTS.map((i) => (
                        <span key={i} className="lg-seg relative block h-1 flex-1 rounded-[1px] bg-primary/15">
                          <i
                            className="absolute inset-0 block rounded-[1px] bg-primary"
                            style={{ animationDelay: `${i * 0.08}s` }}
                          />
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                    <ShieldCheck aria-hidden className="size-3.5 text-primary" />
                    Koneksi aman · sesi dikunci untuk admin &amp; staf
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="mt-5 flex justify-center lg:justify-start">
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
              Kembali ke beranda
            </Link>
          </div>
        </section>
      </div>

      {/* Announce the state change; the visuals above are decorative. */}
      <span className="sr-only" aria-live="polite">
        {status === "busy" && "Memeriksa akun…"}
        {status === "success" && "Akses diterima, mengalihkan…"}
      </span>
    </main>
  );
}

/**
 * The TV with the padlock on it. Every state-dependent piece is styled from the root's
 * `data-state` (see CSS above); nothing here takes props.
 */
function ConsoleScene() {
  return (
    <svg
      viewBox="0 0 480 372"
      className="h-auto w-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="lg-lockglow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#20a83a" stopOpacity=".5" />
          <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lg-floor" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#61e06a" stopOpacity=".3" />
          <stop offset="1" stopColor="#61e06a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1c10" />
          <stop offset="1" stopColor="#1d3a22" />
        </linearGradient>
        <pattern id="lg-scan" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="2" fill="#000" opacity=".28" />
        </pattern>
        <clipPath id="lg-screen">
          <rect x="108" y="38" width="264" height="164" rx="10" />
        </clipPath>
        <g id="lg-pad">
          <path
            d="M40 52Q40 40 56 40H134Q150 40 150 52L158 84Q160 98 146 98Q134 98 128 86L122 76H68L62 86Q56 98 44 98Q30 98 32 84Z"
            fill="#131313"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="55" y="56" width="16" height="6" rx="2" fill="#353534" />
          <rect x="60" y="51" width="6" height="16" rx="2" fill="#353534" />
          <rect x="60" y="51" width="6" height="5" rx="2" fill="currentColor" />
          <circle cx="126" cy="54" r="4" fill="#61e06a" />
          <circle cx="136" cy="62" r="4" fill="#ffb84d" />
          <circle cx="126" cy="70" r="4" fill="#ff6b6b" />
          <circle cx="116" cy="62" r="4" fill="#8ab4ff" />
          <rect x="86" y="52" width="16" height="3" rx="1.5" fill="#353534" />
          <circle cx="94" cy="64" r="3" fill="currentColor" />
        </g>
      </defs>

      {/* lantai + glow */}
      <ellipse cx="240" cy="338" rx="210" ry="22" fill="url(#lg-floor)" />

      {/* TV */}
      <rect x="220" y="220" width="40" height="18" fill="#201f1f" />
      <rect x="168" y="236" width="144" height="12" rx="6" fill="#201f1f" stroke="#3e4a3b" strokeWidth="3" />
      <rect x="90" y="20" width="300" height="200" rx="20" fill="#1c1b1b" stroke="#3e4a3b" strokeWidth="6" />
      <rect x="108" y="38" width="264" height="164" rx="10" fill="url(#lg-sky)" />

      <g clipPath="url(#lg-screen)">
        <circle className="lg-pulse" cx="240" cy="124" r="86" fill="url(#lg-lockglow)" style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }} />

        <g fill="#e5e2e1">
          <rect className="lg-twinkle" x="132" y="76" width="3" height="3" />
          <rect className="lg-twinkle" x="338" y="92" width="3" height="3" style={{ animationDelay: ".6s" }} />
          <rect className="lg-twinkle" x="150" y="160" width="3" height="3" style={{ animationDelay: "1.1s" }} />
          <rect className="lg-twinkle" x="334" y="150" width="3" height="3" style={{ animationDelay: ".3s" }} />
        </g>

        {/* HUD */}
        <g fontFamily="ui-monospace, Menlo, Consolas, monospace" fontWeight="700" fontSize="11">
          <text x="124" y="58" fill="#61e06a">ADMIN</text>
          <text x="356" y="58" textAnchor="end" fill="#bdcab7">KLUB SUKARIA</text>
        </g>

        {/* ledakan saat sukses */}
        <g>
          {[0, 0.18, 0.36].map((d) => (
            <circle key={d} className="lg-ring" cx="240" cy="134" r="14" stroke="#61e06a" strokeWidth="3" style={{ animationDelay: `${d}s` }} />
          ))}
          {BURST.map((b, i) => (
            <rect
              key={i}
              className="lg-pc"
              x="237"
              y="131"
              width="6"
              height="6"
              fill={b.c}
              style={{ "--dx": `${b.dx}px`, "--dy": `${b.dy}px` } as CSSProperties}
            />
          ))}
        </g>

        {/* gembok */}
        <g className="lg-lock">
          <g className="lg-shackle">
            <path className="lg-stroke" d="M222 112 V98 a18 18 0 0 1 36 0 V112" stroke="#61e06a" strokeWidth="8" strokeLinecap="round" />
          </g>
          <rect className="lg-body" x="214" y="112" width="52" height="44" rx="8" fill="#61e06a" />
          <circle cx="240" cy="130" r="5.5" fill="#131313" />
          <rect x="238" y="132" width="4" height="12" rx="2" fill="#131313" />
        </g>

        {/* pesan status */}
        <g fontFamily="ui-monospace, Menlo, Consolas, monospace" fontWeight="700" fontSize="13" textAnchor="middle" letterSpacing="2">
          <text className="lg-m lg-m-idle" x="240" y="186" fill="#61e06a">TERKUNCI</text>
          <text className="lg-m lg-m-busy" x="240" y="186" fill="#ffb84d">MEMERIKSA…</text>
          <text className="lg-m lg-m-error" x="240" y="186" fill="#ff6b6b">AKSES DITOLAK</text>
          <text className="lg-m lg-m-success" x="240" y="186" fill="#61e06a">AKSES DITERIMA</text>
        </g>

        <rect x="108" y="38" width="264" height="164" fill="url(#lg-scan)" />
        <polygon points="108,38 210,38 150,202 108,202" fill="#fff" opacity=".05" />
        <rect className="lg-flash" x="108" y="38" width="264" height="164" fill="#ff6b6b" />
      </g>

      {/* controller */}
      <use href="#lg-pad" color="#61e06a" transform="translate(160 302) rotate(-8) scale(1.2) translate(-96 -69)" />
      <use href="#lg-pad" color="#ffb84d" transform="translate(320 302) rotate(8) scale(1.2) translate(-96 -69)" />
    </svg>
  );
}