import type { CSSProperties } from "react";

const MAIN_PATH =
  "M78 24 H200 V96 H78 Q70 96 70 88 V68 A8 8 0 0 0 70 52 V32 Q70 24 78 24 Z";
const STUB_PATH =
  "M200 24 H242 Q250 24 250 32 V52 A8 8 0 0 0 250 68 V88 Q250 96 242 96 H200 Z";

const CSS = `
.pm-coupon{transform-origin:160px 60px;animation:pm-sway 3.2s ease-in-out infinite alternate}
.pm-stub{transform-origin:225px 60px;animation:pm-stub 5s ease-out infinite}
.pm-shine{animation:pm-shine 5s ease-in-out infinite}
.pm-scissors{opacity:0;animation:pm-cut 5s linear infinite}
.pm-top{transform-origin:0px -10px;animation:pm-snip-a .25s ease-in-out infinite alternate}
.pm-bot{transform-origin:0px -10px;animation:pm-snip-b .25s ease-in-out infinite alternate}
.pm-cutline{opacity:0;stroke-dasharray:72;stroke-dashoffset:72;animation:pm-line 5s linear infinite}
.pm-star{transform-box:fill-box;transform-origin:50% 50%;animation:pm-star 1.6s ease-in-out infinite}
.pm-conf{opacity:0;animation:pm-conf 5s ease-out infinite}
@keyframes pm-sway{0%{transform:rotate(-1.5deg) translateY(0)}100%{transform:rotate(1.5deg) translateY(-3px)}}
@keyframes pm-stub{
  0%,50%{transform:translate(0,0) rotate(0)}
  54%{transform:translate(12px,-5px) rotate(11deg)}
  60%,86%{transform:translate(9px,-1px) rotate(6deg)}
  94%,100%{transform:translate(0,0) rotate(0)}
}
@keyframes pm-shine{0%,4%{transform:translateX(0);opacity:0}6%{opacity:1}20%{transform:translateX(160px);opacity:1}22%,100%{transform:translateX(160px);opacity:0}}
@keyframes pm-cut{0%,14%{opacity:0;transform:translateY(0)}16%{opacity:1;transform:translateY(0)}48%{opacity:1;transform:translateY(72px)}52%,100%{opacity:0;transform:translateY(72px)}}
@keyframes pm-snip-a{from{transform:rotate(-14deg)}to{transform:rotate(2deg)}}
@keyframes pm-snip-b{from{transform:rotate(14deg)}to{transform:rotate(-2deg)}}
@keyframes pm-line{0%,16%{opacity:1;stroke-dashoffset:72}48%{opacity:1;stroke-dashoffset:0}60%{opacity:.8;stroke-dashoffset:0}70%,100%{opacity:0;stroke-dashoffset:0}}
@keyframes pm-star{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.25) rotate(20deg)}}
@keyframes pm-conf{0%,52%{opacity:0;transform:translate(0,0) rotate(0)}54%{opacity:1}74%{opacity:1;transform:translate(var(--dx),var(--dy)) rotate(260deg)}84%,100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(260deg)}}
@media (prefers-reduced-motion:reduce){.pm-coupon,.pm-stub,.pm-shine,.pm-scissors,.pm-top,.pm-bot,.pm-cutline,.pm-star,.pm-conf{animation:none!important}}
`;

const CONFETTI = [
  { x: 228, y: 58, dx: 18, dy: -34, c: "#61e06a" },
  { x: 232, y: 62, dx: 34, dy: -12, c: "#ffb84d" },
  { x: 230, y: 66, dx: 30, dy: 22, c: "#8ab4ff" },
  { x: 226, y: 60, dx: -4, dy: -40, c: "#ff6b6b" },
  { x: 228, y: 64, dx: 12, dy: 34, c: "#61e06a" },
  { x: 232, y: 56, dx: 44, dy: -28, c: "#ffb84d" },
];

export function PromoHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Kupon diskon 50 persen yang digunting dan diklaim"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="pm-bg" cx="50%" cy="50%" r="55%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".3" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="pm-clip">
            <rect width="320" height="120" rx="16" />
          </clipPath>
          <clipPath id="pm-main-clip">
            <path d={MAIN_PATH} />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#pm-clip)">
          <ellipse cx="160" cy="60" rx="140" ry="64" fill="url(#pm-bg)" />

          <g className="pm-coupon">
            {/* Bagian utama */}
            <path d={MAIN_PATH} fill="#131313" stroke="#61e06a" strokeWidth="3" strokeLinejoin="round" />
            <text x="88" y="44" fill="#bdcab7" fontSize="11" fontFamily="Plus Jakarta Sans, system-ui, sans-serif" fontWeight="600">
              DISKON
            </text>
            <text x="86" y="82" fill="#61e06a" fontSize="36" fontFamily="Plus Jakarta Sans, system-ui, sans-serif" fontWeight="800">
              50%
            </text>
            <path className="pm-star" d="M172 40 L175 50 L185 53 L175 56 L172 66 L169 56 L159 53 L169 50 Z" fill="#ffb84d" />
            <g clipPath="url(#pm-main-clip)">
              <g className="pm-shine">
                <rect x="40" y="10" width="22" height="100" fill="#fff" fillOpacity=".2" transform="skewX(-20)" />
              </g>
            </g>

            {/* Bagian sobekan (stub) */}
            <g className="pm-stub">
              <path d={STUB_PATH} fill="#131313" stroke="#61e06a" strokeWidth="3" strokeLinejoin="round" />
              <text x="228" y="64" textAnchor="middle" fill="#61e06a" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui, sans-serif" transform="rotate(-90 228 60)">
                Klaim
              </text>
            </g>

            {/* Garis perforasi + jejak gunting */}
            <line x1="200" y1="24" x2="200" y2="96" stroke="#61e06a" strokeOpacity=".7" strokeWidth="2" strokeDasharray="5 4" />
            <line className="pm-cutline" x1="200" y1="24" x2="200" y2="96" stroke="#ffb84d" strokeWidth="2.5" strokeLinecap="round" />

            {/* Gunting */}
            <g transform="translate(200 24)">
              <g className="pm-scissors">
                <g className="pm-top">
                  <line x1="-3" y1="0" x2="3" y2="-22" stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="4" cy="-27" r="4" stroke="#ffb84d" strokeWidth="2" />
                </g>
                <g className="pm-bot">
                  <line x1="3" y1="0" x2="-3" y2="-22" stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="-4" cy="-27" r="4" stroke="#ffb84d" strokeWidth="2" />
                </g>
                <circle cx="0" cy="-10" r="1.8" fill="#131313" />
              </g>
            </g>
          </g>

          {/* Confetti saat sobekan terlepas */}
          {CONFETTI.map((p, i) => (
            <rect
              key={i}
              className="pm-conf"
              x={p.x}
              y={p.y}
              width="5"
              height="3"
              rx="1"
              fill={p.c}
              style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as CSSProperties}
            />
          ))}
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}