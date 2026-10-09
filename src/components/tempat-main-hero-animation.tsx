const CX = 160;
const CY = 60;
const PERIOD = 4; // detik per putaran radar

const CSS = `
.td-sweep{transform-origin:${CX}px ${CY}px;animation:td-spin ${PERIOD}s linear infinite}
.td-blip{opacity:.6;animation:td-blip ${PERIOD}s ease-out infinite}
.td-ping{opacity:0;transform-box:fill-box;transform-origin:50% 50%;animation:td-ping ${PERIOD}s ease-out infinite}
.td-core{transform-box:fill-box;transform-origin:50% 50%;animation:td-core 2s ease-out infinite}
@keyframes td-spin{to{transform:rotate(360deg)}}
@keyframes td-blip{0%{opacity:1}12%{opacity:1}100%{opacity:.22}}
@keyframes td-ping{0%{opacity:.9;transform:scale(1)}28%{opacity:0;transform:scale(4.5)}100%{opacity:0;transform:scale(4.5)}}
@keyframes td-core{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(3)}}
@media (prefers-reduced-motion:reduce){.td-sweep,.td-blip,.td-ping,.td-core{animation:none!important}}
`;

// sudut (derajat, searah jarum jam dari kanan), jarak dari pusat, status
const BLIPS = [
  { a: -35, r: 40, free: true },
  { a: 22, r: 24, free: false },
  { a: 78, r: 42, free: true },
  { a: 132, r: 28, free: true },
  { a: 190, r: 40, free: false },
  { a: 248, r: 32, free: true },
  { a: 300, r: 18, free: true },
].map((b) => {
  const rad = (b.a * Math.PI) / 180;
  const norm = ((b.a % 360) + 360) % 360;
  return {
    x: +(CX + b.r * Math.cos(rad)).toFixed(1),
    y: +(CY + b.r * Math.sin(rad)).toFixed(1),
    color: b.free ? "#61e06a" : "#ffb84d",
    delay: `${((norm / 360) * PERIOD).toFixed(2)}s`,
  };
});

export function TempatMainHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Radar yang memindai tempat main yang kosong dan terpakai"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="td-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".3" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="td-trail" gradientUnits="userSpaceOnUse" x1="212" y1="60" x2="197" y2="23">
            <stop offset="0" stopColor="#61e06a" stopOpacity=".6" />
            <stop offset="1" stopColor="#61e06a" stopOpacity="0" />
          </linearGradient>
          <pattern id="td-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0 H0 V16" stroke="#61e06a" strokeOpacity=".07" strokeWidth="1" />
          </pattern>
          <clipPath id="td-clip">
            <rect width="320" height="120" rx="16" />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#td-clip)">
          <rect width="320" height="120" fill="url(#td-grid)" />
          <ellipse cx={CX} cy={CY} rx="130" ry="70" fill="url(#td-bg)" />

          {/* Legend */}
          <g fontFamily="Plus Jakarta Sans, system-ui, sans-serif" fontSize="10" fill="#bdcab7">
            <circle cx="26" cy="46" r="4" fill="#61e06a" />
            <text x="36" y="49.5">Kosong</text>
            <circle cx="26" cy="68" r="4" fill="#ffb84d" />
            <text x="36" y="71.5">Terpakai</text>
          </g>

          {/* Radar */}
          <circle cx={CX} cy={CY} r="52" fill="#131313" fillOpacity=".7" stroke="#61e06a" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="34" stroke="#3e4a3b" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="17" stroke="#61e06a" strokeOpacity=".7" strokeWidth="2" />
          <path d={`M${CX - 52} ${CY} H${CX + 52} M${CX} ${CY - 52} V${CY + 52}`} stroke="#3e4a3b" strokeWidth="1.5" strokeDasharray="3 4" />

          {/* Sapuan radar + jejak */}
          <g className="td-sweep">
            <path d={`M${CX} ${CY} L${CX + 52} ${CY} A52 52 0 0 0 196.77 23.23 Z`} fill="url(#td-trail)" />
            <line x1={CX} y1={CY} x2={CX + 52} y2={CY} stroke="#61e06a" strokeWidth="3" strokeLinecap="round" />
          </g>

          {/* Titik tempat main: menyala saat disapu */}
          {BLIPS.map((b, i) => (
            <g key={i}>
              <circle className="td-ping" cx={b.x} cy={b.y} r="3" stroke={b.color} strokeWidth="1.5" style={{ animationDelay: b.delay }} />
              <circle className="td-blip" cx={b.x} cy={b.y} r="3.5" fill={b.color} style={{ animationDelay: b.delay }} />
            </g>
          ))}

          {/* Pusat */}
          <circle className="td-core" cx={CX} cy={CY} r="4" stroke="#61e06a" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="4" fill="#61e06a" />

          {/* Statistik kanan */}
          <g>
            <rect x="238" y="44" width="56" height="6" rx="3" fill="#201f1f" />
            <rect x="238" y="44" width="38" height="6" rx="3" fill="#61e06a" />
            <rect x="238" y="62" width="56" height="6" rx="3" fill="#201f1f" />
            <rect x="238" y="62" width="18" height="6" rx="3" fill="#ffb84d" />
          </g>
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}