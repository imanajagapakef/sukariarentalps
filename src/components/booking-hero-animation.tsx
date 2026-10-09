const CSS = `
.bk *{transform-box:fill-box}
.bk-pad{transform-origin:50% 50%;animation:bk-float 2.4s ease-in-out infinite}
.bk-btn{transform-origin:50% 50%;animation:bk-press 2s ease-in-out infinite}
.bk-dpad{animation:bk-dpad 1s steps(2,end) infinite}
.bk-led{animation:bk-blink 1s steps(2,end) infinite}
.bk-link{animation:bk-link .8s linear infinite}
.bk-pick{animation:bk-pick 4s ease-in-out infinite}
.bk-stamp{transform-origin:50% 50%;animation:bk-stamp 4s ease-out infinite}
.bk-check{stroke-dasharray:20;animation:bk-check 4s ease-out infinite}
.bk-ring{transform-origin:50% 50%;animation:bk-ring 4s ease-out infinite}
@keyframes bk-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-4px) rotate(2deg)}}
@keyframes bk-press{0%,30%,100%{opacity:.5;transform:scale(1)}12%{opacity:1;transform:scale(1.35)}}
@keyframes bk-dpad{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes bk-blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes bk-link{to{stroke-dashoffset:-16}}
@keyframes bk-pick{
  0%{opacity:0;transform:translateY(0)}
  4%,18%{opacity:1;transform:translateY(0)}
  24%,40%{opacity:1;transform:translateY(28px)}
  46%,90%{opacity:1;transform:translateY(14px)}
  96%,100%{opacity:0;transform:translateY(14px)}
}
@keyframes bk-stamp{
  0%,50%{opacity:0;transform:scale(.2) rotate(-20deg)}
  56%{opacity:1;transform:scale(1.25) rotate(8deg)}
  62%,90%{opacity:1;transform:scale(1) rotate(0)}
  96%,100%{opacity:0;transform:scale(1) rotate(0)}
}
@keyframes bk-check{0%,54%{stroke-dashoffset:20}64%,92%{stroke-dashoffset:0}100%{stroke-dashoffset:20}}
@keyframes bk-ring{0%,54%{opacity:0;transform:scale(1)}56%{opacity:.8;transform:scale(1)}72%,100%{opacity:0;transform:scale(2.6)}}
@media (prefers-reduced-motion:reduce){.bk *{animation:none!important}.bk-stamp{opacity:1}.bk-pick{opacity:1;transform:translateY(14px)}.bk-check{stroke-dashoffset:0}}
`;

export function BookingHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="bk h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Controller game mengirim booking ke tiket jadwal yang terkonfirmasi"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="bk-bg" cx="30%" cy="55%" r="70%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".25" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <rect width="320" height="120" rx="16" fill="url(#bk-bg)" />

        {/* Jalur "kirim booking" dari controller ke tiket */}
        <path className="bk-link" d="M154 62 H194" stroke="#61e06a" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 5" />

        {/* Controller */}
        <g className="bk-pad">
          <path
            d="M40 52 Q40 40 56 40 H134 Q150 40 150 52 L158 84 Q160 98 146 98 Q134 98 128 86 L122 76 H68 L62 86 Q56 98 44 98 Q30 98 32 84 Z"
            fill="#131313"
            stroke="#61e06a"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* D-pad */}
          <rect x="55" y="56" width="16" height="6" rx="2" fill="#353534" />
          <rect x="60" y="51" width="6" height="16" rx="2" fill="#353534" />
          <rect className="bk-dpad" x="60" y="51" width="6" height="5" rx="2" fill="#61e06a" />
          <rect className="bk-dpad" x="60" y="62" width="6" height="5" rx="2" fill="#61e06a" style={{ animationDelay: ".5s" }} />
          {/* Tombol */}
          <circle className="bk-btn" cx="126" cy="54" r="4" fill="#61e06a" />
          <circle className="bk-btn" cx="136" cy="62" r="4" fill="#ffb84d" style={{ animationDelay: ".5s" }} />
          <circle className="bk-btn" cx="126" cy="70" r="4" fill="#ff6b6b" style={{ animationDelay: "1s" }} />
          <circle className="bk-btn" cx="116" cy="62" r="4" fill="#8ab4ff" style={{ animationDelay: "1.5s" }} />
          {/* Center */}
          <rect x="86" y="52" width="16" height="3" rx="1.5" fill="#353534" />
          <circle className="bk-led" cx="94" cy="64" r="3" fill="#61e06a" />
        </g>

        {/* Tiket jadwal */}
        <rect x="196" y="18" width="100" height="84" rx="12" fill="#131313" stroke="#3e4a3b" strokeWidth="2" />
        <circle cx="196" cy="60" r="6" fill="#1c1b1b" stroke="#3e4a3b" strokeWidth="2" />
        <rect x="190" y="52" width="6" height="16" fill="#1c1b1b" />
        <rect x="206" y="26" width="36" height="6" rx="3" fill="#3e4a3b" />
        <rect x="248" y="26" width="10" height="6" rx="3" fill="#61e06a" opacity=".6" />

        {[40, 54, 68].map((y) => (
          <rect key={y} x="206" y={y} width="80" height="9" rx="4.5" fill="#201f1f" />
        ))}

        {/* Highlight slot yang lagi "dipilih" */}
        <rect className="bk-pick" x="206" y="40" width="80" height="9" rx="4.5" fill="#61e06a" />
        {[40, 54, 68].map((y, i) => (
          <g key={`t${y}`}>
            <rect x="212" y={y + 3} width={i === 1 ? 22 : 16} height="3" rx="1.5" fill="#3e4a3b" />
            <rect x="262" y={y + 3} width="18" height="3" rx="1.5" fill="#3e4a3b" />
          </g>
        ))}

        {/* Stempel "terbooking" */}
        <circle className="bk-ring" cx="278" cy="90" r="10" stroke="#61e06a" strokeWidth="2" />
        <g className="bk-stamp">
          <circle cx="278" cy="90" r="10" fill="#61e06a" />
          <path className="bk-check" d="M273 90 L277 94 L284 86" stroke="#131313" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}