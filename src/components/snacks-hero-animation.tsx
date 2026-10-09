import type { CSSProperties } from "react";

const CSS = `
.sk *{transform-box:fill-box}
.sk-bucket{transform-origin:50% 100%;animation:sk-squash 2.2s ease-in-out infinite}
.sk-piece{opacity:0;transform-origin:50% 50%;animation:sk-pop 2.2s linear infinite}
.sk-steam{opacity:.35;transform-origin:50% 100%;animation:sk-steam 2.4s ease-out infinite}
.sk-bub{opacity:.5;animation:sk-bub 2s ease-in infinite}
.sk-straw{transform-origin:50% 100%;animation:sk-straw 2.6s ease-in-out infinite}
.sk-spark{animation:sk-spark 5s ease-in infinite}
@keyframes sk-squash{0%,100%{transform:scale(1,1)}8%{transform:scale(1.04,.95)}16%{transform:scale(.98,1.03)}28%{transform:scale(1,1)}}
@keyframes sk-pop{
  0%{opacity:0;transform:translate(0,0) rotate(0);animation-timing-function:cubic-bezier(.2,.6,.4,1)}
  4%{opacity:1}
  45%{opacity:1;transform:translate(calc(var(--dx) * .6),-44px) rotate(160deg);animation-timing-function:cubic-bezier(.6,0,.9,.6)}
  88%{opacity:1;transform:translate(var(--dx),6px) rotate(320deg)}
  94%,100%{opacity:0;transform:translate(var(--dx),6px) rotate(320deg)}
}
@keyframes sk-steam{0%{opacity:0;transform:translateY(8px) scaleX(.8)}30%{opacity:.6}100%{opacity:0;transform:translateY(-12px) scaleX(1.2)}}
@keyframes sk-bub{0%{opacity:0;transform:translateY(0)}25%{opacity:.7}100%{opacity:0;transform:translateY(-22px)}}
@keyframes sk-straw{0%,100%{transform:rotate(0)}50%{transform:rotate(-6deg)}}
@keyframes sk-spark{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-60px)}}
@media (prefers-reduced-motion:reduce){.sk *{animation:none!important}}
`;

const PIECES = [
  { dx: -38, d: "0s" },
  { dx: -18, d: "-0.45s" },
  { dx: 4, d: "-0.9s" },
  { dx: 22, d: "-1.35s" },
  { dx: 40, d: "-1.8s" },
];

const SPARKS = [
  { x: 22, y: 90, d: "0s", s: 4 },
  { x: 298, y: 86, d: "1.8s", s: 4 },
  { x: 118, y: 40, d: "3.2s", s: 3 },
  { x: 208, y: 30, d: "2.4s", s: 3 },
];

export function SnacksHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="sk h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Popcorn meletup, mie cup mengepul, dan minuman dingin"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="sk-bg" cx="50%" cy="70%" r="55%">
            <stop offset="0" stopColor="#ffb84d" stopOpacity=".22" />
            <stop offset="1" stopColor="#ffb84d" stopOpacity="0" />
          </radialGradient>
          <clipPath id="sk-clip">
            <rect width="320" height="120" rx="16" />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#sk-clip)">
          <rect width="320" height="120" fill="url(#sk-bg)" />

          {SPARKS.map((p, i) => (
            <rect key={i} className="sk-spark" x={p.x} y={p.y} width={p.s} height={p.s} fill="#61e06a" style={{ animationDelay: p.d }} />
          ))}

          {/* Meja */}
          <rect x="20" y="100" width="280" height="6" rx="3" fill="#201f1f" stroke="#3e4a3b" strokeWidth="2" />

          {/* Mie cup (kiri) + uap */}
          <g>
            <path className="sk-steam" d="M64 54 Q58 44 64 34 Q70 24 64 14" stroke="#e5e2e1" strokeWidth="3" strokeLinecap="round" />
            <path className="sk-steam" d="M78 54 Q72 44 78 34 Q84 24 78 14" stroke="#e5e2e1" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: ".8s" }} />
            <path className="sk-steam" d="M92 54 Q86 44 92 34 Q98 24 92 14" stroke="#e5e2e1" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "1.6s" }} />
            <path d="M52 62 L104 62 L98 100 L58 100 Z" fill="#131313" stroke="#ffb84d" strokeWidth="3" strokeLinejoin="round" />
            <rect x="48" y="56" width="60" height="8" rx="4" fill="#ffb84d" />
            <path d="M55 78 H101" stroke="#ffb84d" strokeWidth="6" opacity=".35" />
            <circle cx="78" cy="84" r="6" fill="#ff6b6b" opacity=".9" />
          </g>

          {/* Bucket popcorn (tengah) */}
          <g>
            {PIECES.map((p, i) => (
              <g key={i} className="sk-piece" style={{ "--dx": `${p.dx}px`, animationDelay: p.d, transform: "translate(0,0)" } as CSSProperties}>
                <circle cx="160" cy="46" r="5" fill="#fff3d1" />
                <circle cx="164" cy="43" r="3.5" fill="#ffe0a3" />
              </g>
            ))}
            <g className="sk-bucket">
              <circle cx="140" cy="49" r="8" fill="#fff3d1" />
              <circle cx="153" cy="44" r="9" fill="#ffe0a3" />
              <circle cx="168" cy="44" r="9" fill="#fff3d1" />
              <circle cx="180" cy="49" r="8" fill="#ffe0a3" />
              <circle cx="160" cy="50" r="9" fill="#fff3d1" />
              <path d="M130 52 L190 52 L182 100 L138 100 Z" fill="#131313" stroke="#61e06a" strokeWidth="3" strokeLinejoin="round" />
              <polygon points="140,52 152,52 150,100 144,100" fill="#61e06a" opacity=".85" />
              <polygon points="168,52 180,52 176,100 170,100" fill="#61e06a" opacity=".85" />
            </g>
          </g>

          {/* Minuman dingin (kanan) */}
          <g>
            <g className="sk-straw">
              <path d="M258 54 L268 28" stroke="#ff6b6b" strokeWidth="4" strokeLinecap="round" />
            </g>
            <path d="M234 60 L274 60 L268 100 L240 100 Z" fill="#131313" stroke="#8ab4ff" strokeWidth="3" strokeLinejoin="round" />
            <path d="M237 76 L271 76 L268 100 L240 100 Z" fill="#8ab4ff" opacity=".28" />
            <rect x="230" y="54" width="48" height="7" rx="3.5" fill="#8ab4ff" />
            <circle className="sk-bub" cx="248" cy="94" r="2.5" fill="#8ab4ff" />
            <circle className="sk-bub" cx="258" cy="96" r="2" fill="#8ab4ff" style={{ animationDelay: ".7s" }} />
            <circle className="sk-bub" cx="264" cy="92" r="2.5" fill="#8ab4ff" style={{ animationDelay: "1.3s" }} />
          </g>
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}