const CSS = `
.gm *{transform-box:fill-box}
.gm-card{transform-origin:50% 50%;animation:gm-cycle 6s cubic-bezier(.5,0,.2,1) infinite}
.gm-l{opacity:.55;transform:translateX(-76px) scale(.78)}
.gm-c{opacity:1;transform:none}
.gm-r{opacity:.55;transform:translateX(76px) scale(.78)}
.gm-br{transform-origin:50% 50%;animation:gm-br 1.6s ease-in-out infinite}
.gm-glow{animation:gm-glow 3s ease-in-out infinite}
.gm-run{animation:gm-run .5s steps(2,end) infinite}
.gm-dash{animation:gm-dash .6s linear infinite}
.gm-gem{transform-origin:50% 50%;animation:gm-gem 2s ease-in-out infinite}
.gm-spark{animation:gm-spark 6s ease-in infinite}
@keyframes gm-cycle{
  0%,4%{opacity:0;transform:translateX(-76px) scale(.78)}
  8%,30%{opacity:.55;transform:translateX(-76px) scale(.78)}
  38%,63%{opacity:1;transform:translateX(0) scale(1)}
  71%,88%{opacity:.55;transform:translateX(76px) scale(.78)}
  94%,100%{opacity:0;transform:translateX(76px) scale(.78)}
}
@keyframes gm-br{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
@keyframes gm-glow{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes gm-run{0%{transform:translateY(0)}100%{transform:translateY(-2px)}}
@keyframes gm-dash{to{stroke-dashoffset:-12}}
@keyframes gm-gem{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.6)}}
@keyframes gm-spark{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-70px)}}
@media (prefers-reduced-motion:reduce){.gm *{animation:none!important}}
`;

const SPARKS = [
  { x: 24, y: 96, d: "0s", s: 4 },
  { x: 292, y: 100, d: "1.5s", s: 4 },
  { x: 60, y: 70, d: "3s", s: 3 },
  { x: 262, y: 76, d: "4.2s", s: 3 },
  { x: 300, y: 50, d: "2.2s", s: 3 },
];

function CardBase({ color }: { color: string }) {
  return (
    <>
      <rect x="-28" y="-38" width="56" height="76" rx="9" fill="#131313" stroke={color} strokeWidth="3" />
      <rect x="-18" y="20" width="36" height="4" rx="2" fill={color} />
      <rect x="-18" y="28" width="22" height="3" rx="1.5" fill="#3e4a3b" />
    </>
  );
}

export function GamesHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="gm h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Koleksi game berputar seperti carousel pilihan game"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="gm-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".4" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="gm-clip">
            <rect width="320" height="120" rx="16" />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#gm-clip)">
          <ellipse className="gm-glow" cx="160" cy="62" rx="120" ry="64" fill="url(#gm-bg)" />

          {SPARKS.map((p, i) => (
            <rect key={i} className="gm-spark" x={p.x} y={p.y} width={p.s} height={p.s} fill="#61e06a" style={{ animationDelay: p.d }} />
          ))}

          {/* Slot terpilih */}
          <g className="gm-br" stroke="#61e06a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M130 32 V20 H142" />
            <path d="M190 32 V20 H178" />
            <path d="M130 88 V100 H142" />
            <path d="M190 88 V100 H178" />
          </g>

          {/* Kartu 1: Invader (hijau) */}
          <g transform="translate(160 60)">
            <g className="gm-card gm-l">
              <CardBase color="#61e06a" />
              <g className="gm-run">
                <rect x="-10" y="-14" width="20" height="10" fill="#61e06a" />
                <rect x="-14" y="-10" width="4" height="8" fill="#61e06a" />
                <rect x="10" y="-10" width="4" height="8" fill="#61e06a" />
                <rect x="-6" y="-18" width="3" height="4" fill="#61e06a" />
                <rect x="3" y="-18" width="3" height="4" fill="#61e06a" />
                <rect x="-6" y="-12" width="3" height="3" fill="#131313" />
                <rect x="3" y="-12" width="3" height="3" fill="#131313" />
                <rect x="-8" y="-4" width="4" height="4" fill="#61e06a" />
                <rect x="4" y="-4" width="4" height="4" fill="#61e06a" />
              </g>
              <rect x="-1" y="6" width="2" height="7" fill="#e5e2e1" />
            </g>
          </g>

          {/* Kartu 2: Racing (amber) */}
          <g transform="translate(160 60)">
            <g className="gm-card gm-c" style={{ animationDelay: "-2s" }}>
              <CardBase color="#ffb84d" />
              <circle cx="0" cy="-14" r="9" fill="#ffb84d" opacity=".9" />
              <rect x="-26" y="-6" width="52" height="20" fill="#131313" />
              <path d="M-26 -5 H26" stroke="#ffb84d" strokeWidth="1.5" />
              <polygon points="-24,14 -4,-4 4,-4 24,14" fill="#2a2a2a" />
              <path className="gm-dash" d="M0 -3 V14" stroke="#ffb84d" strokeWidth="2" strokeDasharray="3 3" />
            </g>
          </g>

          {/* Kartu 3: Gem RPG (biru) */}
          <g transform="translate(160 60)">
            <g className="gm-card gm-r" style={{ animationDelay: "-4s" }}>
              <CardBase color="#8ab4ff" />
              <g className="gm-gem">
                <polygon points="0,-24 13,-10 0,10 -13,-10" fill="#8ab4ff" />
                <path d="M-13 -10 H13 M0 -24 L-5 -10 L0 10 M0 -24 L5 -10 L0 10" stroke="#131313" strokeOpacity=".35" strokeWidth="1.2" />
              </g>
            </g>
          </g>
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}