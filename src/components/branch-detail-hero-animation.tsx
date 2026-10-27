const CSS = `
.bh *{transform-box:fill-box}
.bh-band{filter:drop-shadow(0 0 8px rgba(97,224,106,.6));animation:bh-glow 2.4s ease-in-out infinite}
.bh-cup{transform-origin:50% 50%;animation:bh-beat .8s ease-in-out infinite}
.bh-ring{transform-origin:50% 50%;animation:bh-ring 2.4s ease-out infinite}
.bh-bar{transform-origin:50% 100%;animation:bh-bar 1s ease-in-out infinite}
.bh-note{animation:bh-note 3.6s ease-out infinite}
.bh-led{animation:bh-blink 1s steps(2,end) infinite}
@keyframes bh-glow{0%,100%{opacity:.8}50%{opacity:1}}
@keyframes bh-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes bh-ring{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(2.6)}}
@keyframes bh-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@keyframes bh-note{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(10px,-52px)}}
@keyframes bh-blink{0%,100%{opacity:1}50%{opacity:.2}}
@media (prefers-reduced-motion:reduce){.bh *{animation:none!important}}
`;

// tinggi bar (px) + durasi + delay, dibuat beda-beda biar nggak kelihatan robotik
const BARS = [
  { h: 34, d: 0.9, s: 0 },
  { h: 56, d: 0.7, s: 0.15 },
  { h: 42, d: 1.1, s: 0.3 },
  { h: 66, d: 0.8, s: 0.05 },
  { h: 48, d: 1.0, s: 0.4 },
  { h: 30, d: 0.75, s: 0.2 },
];

export function BranchDetailHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="bh h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Headset gaming dengan visualizer suara"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="bh-bg" cx="50%" cy="55%" r="60%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".28" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="bh-clip">
            <rect x="0" y="0" width="320" height="120" rx="16" />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#bh-clip)">
          <rect width="320" height="120" fill="url(#bh-bg)" />

          {/* Equalizer kiri & kanan */}
          {BARS.map((b, i) => (
            <rect
              key={`l${i}`}
              className="bh-bar"
              x={22 + i * 11}
              y={104 - b.h}
              width="6"
              height={b.h}
              rx="3"
              fill="#61e06a"
              opacity={0.35 + i * 0.1}
              style={{ animationDuration: `${b.d}s`, animationDelay: `${b.s}s` }}
            />
          ))}
          {BARS.map((b, i) => (
            <rect
              key={`r${i}`}
              className="bh-bar"
              x={298 - i * 11 - 6}
              y={104 - b.h}
              width="6"
              height={b.h}
              rx="3"
              fill="#61e06a"
              opacity={0.35 + i * 0.1}
              style={{ animationDuration: `${b.d + 0.1}s`, animationDelay: `${b.s + 0.1}s` }}
            />
          ))}

          {/* Gelombang suara dari ear cup */}
          {[0, 1.2].map((delay) => (
            <g key={delay}>
              <circle className="bh-ring" cx="109" cy="72" r="12" stroke="#61e06a" strokeWidth="2" style={{ animationDelay: `${delay}s` }} />
              <circle className="bh-ring" cx="211" cy="72" r="12" stroke="#61e06a" strokeWidth="2" style={{ animationDelay: `${delay}s` }} />
            </g>
          ))}

          {/* Headset */}
          <path className="bh-band" d="M110 62 Q110 16 160 16 Q210 16 210 62" stroke="#61e06a" strokeWidth="6" strokeLinecap="round" />
          <path d="M122 30 Q160 8 198 30" stroke="#3e4a3b" strokeWidth="2" strokeLinecap="round" opacity=".8" />

          <g className="bh-cup">
            <rect x="94" y="48" width="30" height="48" rx="11" fill="#61e06a" />
            <rect x="99" y="55" width="12" height="34" rx="6" fill="#20a83a" />
            <rect x="94" y="48" width="30" height="48" rx="11" stroke="#e5e2e1" strokeOpacity=".25" strokeWidth="2" />
          </g>
          <g className="bh-cup" style={{ animationDelay: ".1s" }}>
            <rect x="196" y="48" width="30" height="48" rx="11" fill="#61e06a" />
            <rect x="209" y="55" width="12" height="34" rx="6" fill="#20a83a" />
            <rect x="196" y="48" width="30" height="48" rx="11" stroke="#e5e2e1" strokeOpacity=".25" strokeWidth="2" />
          </g>

          {/* Mic */}
          <path d="M214 94 Q216 112 192 110" stroke="#61e06a" strokeWidth="3" strokeLinecap="round" />
          <rect x="182" y="105" width="12" height="9" rx="4.5" fill="#e5e2e1" />
          <circle className="bh-led" cx="188" cy="109.5" r="2" fill="#ff6b6b" />

          {/* Not musik melayang */}
          <text className="bh-note" x="80" y="56" fill="#61e06a" fontSize="14">♪</text>
          <text className="bh-note" x="236" y="52" fill="#ffb84d" fontSize="12" style={{ animationDelay: "1.3s" }}>♫</text>
          <text className="bh-note" x="150" y="12" fill="#61e06a" fontSize="10" opacity=".7" style={{ animationDelay: "2.4s" }}>♪</text>
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}