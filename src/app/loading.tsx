import type { CSSProperties } from "react";

const CSS = `
.ls-grid{animation:ls-grid 4s linear infinite}
.ls-glow{animation:ls-pulse 2.8s ease-in-out infinite}
.ls-logo{animation:ls-float 2.6s ease-in-out infinite}
.ls-seg i{opacity:0;animation:ls-seg 3s ease-in-out infinite}
.ls-shine{animation:ls-shine 1.6s linear infinite}
.ls-dot{animation:ls-dotout 4.2s ease-out infinite}
.ls-chk{animation:ls-chk 4.2s ease-out infinite}
.ls-txt{animation:ls-txt 4.2s ease-out infinite}
.ls-glyph{animation:ls-drift 7s ease-in-out infinite alternate}
.ls-spark{animation:ls-rise linear infinite}
.ls-flicker{animation:ls-flicker 1s steps(2,end) infinite}
.ls-cursor{animation:ls-flicker .8s steps(2,end) infinite}

@keyframes ls-grid{to{transform:translateY(32px)}}
@keyframes ls-pulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
@keyframes ls-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-10px) rotate(1deg)}}
@keyframes ls-seg{
  0%{opacity:0;transform:scaleY(.6)}
  8%{opacity:1;transform:scaleY(1.45)}
  16%,70%{opacity:1;transform:scaleY(1)}
  86%,100%{opacity:0;transform:scaleY(.6)}
}
@keyframes ls-shine{from{transform:translateX(-120%) skewX(-20deg)}to{transform:translateX(420%) skewX(-20deg)}}
@keyframes ls-dotout{0%,14%{opacity:1;transform:scale(1)}20%,88%{opacity:0;transform:scale(.3)}94%,100%{opacity:1;transform:scale(1)}}
@keyframes ls-chk{0%,14%{opacity:0;transform:scale(.3)}20%{opacity:1;transform:scale(1.35)}26%,88%{opacity:1;transform:scale(1)}94%,100%{opacity:0;transform:scale(.3)}}
@keyframes ls-txt{20%,88%{color:#61e06a}}
@keyframes ls-drift{0%{transform:translate(0,0) rotate(-12deg)}100%{transform:translate(8px,-18px) rotate(14deg)}}
@keyframes ls-rise{0%{opacity:0;transform:translateY(0)}15%{opacity:.9}100%{opacity:0;transform:translateY(-70dvh)}}
@keyframes ls-flicker{0%,100%{opacity:1}50%{opacity:.25}}

@media (prefers-reduced-motion:reduce){
  .ls-grid,.ls-glow,.ls-logo,.ls-seg i,.ls-shine,.ls-dot,.ls-chk,.ls-txt,.ls-glyph,.ls-spark,.ls-flicker,.ls-cursor{animation:none!important}
  .ls-seg:nth-child(-n+7) i{opacity:1}
  .ls-chk{opacity:0}
  .ls-spark{opacity:0}
}
`;

const SEGMENTS = Array.from({ length: 12 }, (_, i) => i);

const SPARKS = [
  { l: 6, s: 4, d: 0, t: 6.5 },
  { l: 15, s: 3, d: 2.1, t: 8 },
  { l: 27, s: 5, d: 4.2, t: 7 },
  { l: 38, s: 3, d: 1.2, t: 9 },
  { l: 49, s: 4, d: 5.5, t: 6 },
  { l: 58, s: 3, d: 3.1, t: 8.5 },
  { l: 69, s: 5, d: 0.8, t: 7.5 },
  { l: 78, s: 3, d: 4.8, t: 6.8 },
  { l: 88, s: 4, d: 2.6, t: 9 },
  { l: 94, s: 3, d: 6.2, t: 7.2 },
];

const STEPS = [
  { label: "Ngecas stik", delay: "0s" },
  { label: "Nyiapin konsol", delay: "1.2s" },
  { label: "Mulai main", delay: "2.4s" },
];

const sparkColors = ["#61e06a", "#ffb84d", "#8ab4ff"];

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="relative flex min-h-dvh flex-col items-center justify-center gap-7 overflow-hidden bg-background px-4"
    >
      <style>{CSS}</style>
      <span className="sr-only">Memuat halaman…</span>

      {/* ---------- Latar (dekoratif) ---------- */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* grid pixel yang pelan-pelan mengalir, memudar ke tepi */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            WebkitMaskImage: "radial-gradient(60% 55% at 50% 45%, #000 15%, transparent 75%)",
            maskImage: "radial-gradient(60% 55% at 50% 45%, #000 15%, transparent 75%)",
          }}
        >
          <div
            className="ls-grid absolute -inset-8"
            style={{
              backgroundImage:
                "linear-gradient(rgba(97,224,106,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(97,224,106,.07) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        {/* glow utama */}
        <div
          className="ls-glow absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(55% 45% at 50% 42%, rgba(32,168,58,0.30), transparent 70%)",
          }}
        />

        {/* pixel sparkle naik dari bawah */}
        {SPARKS.map((p, i) => (
          <span
            key={i}
            className="ls-spark absolute bottom-0 block"
            style={
              {
                left: `${p.l}%`,
                width: p.s,
                height: p.s,
                background: sparkColors[i % sparkColors.length],
                animationDuration: `${p.t}s`,
                animationDelay: `${p.d}s`,
                opacity: 0,
              } as CSSProperties
            }
          />
        ))}

        {/* ikon tombol controller melayang */}
        <svg className="ls-glyph absolute left-[9%] top-[20%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#61e06a" strokeWidth="2.5" strokeLinejoin="round">
          <path d="M12 3 L22 20 H2 Z" />
        </svg>
        <svg className="ls-glyph absolute right-[10%] top-[24%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5" style={{ animationDelay: "-2s" }}>
          <circle cx="12" cy="12" r="9" />
        </svg>
        <svg className="ls-glyph absolute bottom-[22%] left-[13%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#8ab4ff" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "-4s" }}>
          <path d="M4 4 L20 20 M20 4 L4 20" />
        </svg>
        <svg className="ls-glyph absolute bottom-[20%] right-[12%] w-6 opacity-40 md:w-9" viewBox="0 0 24 24" fill="none" stroke="#ffb84d" strokeWidth="2.5" strokeLinejoin="round" style={{ animationDelay: "-5.5s" }}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        </svg>

        {/* scanline + vignette */}
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

      {/* ---------- Logo ---------- */}
      <div className="relative">
        <div
          aria-hidden
          className="ls-glow absolute left-1/2 top-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl md:h-52 md:w-96"
          style={{ background: "radial-gradient(closest-side, rgba(97,224,106,.4), transparent)" }}
        />
        {/* Inline copy of /brand/logo-primary.svg (2.6 KB). Inlining paints the
            wordmark instantly and avoids a request racing the page data; the
            file stays in /public for other pages. Decorative: the sr-only
            "Memuat halaman…" above already announces the state. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 420 84"
          aria-hidden="true"
          className="ls-logo relative h-auto w-56 md:w-72"
          style={{ filter: "drop-shadow(0 0 18px rgba(97,224,106,.45))" }}
        >
          <defs>
            <linearGradient id="lsLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2ee450" />
              <stop offset="100%" stopColor="#20a83a" />
            </linearGradient>
            <filter id="lsLogoDrop" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#20a83a" floodOpacity="0.4" />
            </filter>
          </defs>
          <g transform="translate(10, 10)">
            <rect x="0" y="0" width="64" height="64" rx="14" fill="#181818" stroke="#2a2a2a" strokeWidth="2" />
            <rect x="4" y="4" width="56" height="56" rx="10" fill="#121212" />
            <path d="M12 18 L12 12 L18 12" stroke="#20a83a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M52 46 L52 52 L46 52" stroke="#20a83a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="27" y="14" width="10" height="36" rx="3" fill="url(#lsLogoGrad)" filter="url(#lsLogoDrop)" />
            <rect x="14" y="27" width="36" height="10" rx="3" fill="url(#lsLogoGrad)" filter="url(#lsLogoDrop)" />
            <circle cx="32" cy="32" r="4.5" fill="#0e0e0e" />
            <circle cx="19" cy="19" r="2" fill="#20a83a" opacity="0.8" />
            <circle cx="45" cy="45" r="2" fill="#20a83a" opacity="0.8" />
          </g>
          <text x="88" y="44" fontFamily="'Anton','Impact',sans-serif" fontSize="34" fontWeight="900" fill="#FFFFFF" letterSpacing="1.5">KLUB</text>
          <text x="178" y="44" fontFamily="'Anton','Impact',sans-serif" fontSize="34" fontWeight="900" fill="#20a83a" letterSpacing="1.5">SUKARIA</text>
          <g transform="translate(88, 54)">
            <rect x="0" y="0" width="112" height="18" rx="4" fill="#20a83a" />
            <text x="56" y="13" fontFamily="'Plus Jakarta Sans',-apple-system,sans-serif" fontSize="10" fontWeight="800" fill="#0b0b0b" textAnchor="middle" letterSpacing="1.2">GAMING HOUSE</text>
            <text x="122" y="13" fontFamily="'Plus Jakarta Sans',-apple-system,sans-serif" fontSize="10" fontWeight="700" fill="#888888" letterSpacing="1.5">• 24 JAM TANJUNGPINANG</text>
          </g>
        </svg>
      </div>

      {/* ---------- Bar HP / loading bersegmen ---------- */}
      <div aria-hidden className="relative w-56 md:w-72">
        <div className="relative flex gap-[3px] overflow-hidden rounded-md border-2 border-[#3e4a3b] bg-[#131313] p-[3px]">
          {SEGMENTS.map((i) => (
            <span
              key={i}
              className="ls-seg relative block h-3 flex-1 rounded-[2px] bg-[rgba(97,224,106,.14)] md:h-3.5"
            >
              <i
                className="absolute inset-0 block rounded-[2px] bg-primary"
                style={{
                  boxShadow: "0 0 10px rgba(97,224,106,.7)",
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            </span>
          ))}
          {/* kilau yang menyapu bar */}
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/5 overflow-hidden">
            <span className="ls-shine block h-full w-full bg-white/25" />
          </span>
        </div>
      </div>

      {/* ---------- Teks ---------- */}
      <p className="font-display text-lg uppercase tracking-[0.2em] text-on-surface md:text-xl">
        Gas sekejap lagi<span className="ls-flicker">…</span>
        <span className="ls-cursor ml-1 inline-block h-[0.9em] w-[0.5em] translate-y-[0.1em] bg-primary" aria-hidden />
      </p>

      {/* ---------- Boot checklist ---------- */}
      <ul aria-hidden className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground md:text-xs">
        {STEPS.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="relative inline-block h-3.5 w-3.5">
              <i
                className="ls-dot absolute inset-[3px] block bg-[#ffb84d]"
                style={{ animationDelay: s.delay }}
              />
              <svg
                className="ls-chk absolute inset-0 opacity-0"
                viewBox="0 0 14 14"
                fill="none"
                stroke="#61e06a"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animationDelay: s.delay }}
              >
                <path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" />
              </svg>
            </span>
            <span className="ls-txt" style={{ animationDelay: s.delay }}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}