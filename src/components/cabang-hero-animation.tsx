const CSS = `
.cb *{transform-box:fill-box}
.cb-main{animation:cb-drop 5s ease-in infinite}
.cb-shadow{transform-origin:50% 50%;animation:cb-shadow 5s ease-in infinite}
.cb-ring{transform-origin:50% 50%;animation:cb-ring 5s ease-out infinite}
.cb-s1{transform-origin:50% 100%;animation:cb-pop1 5s ease-out infinite}
.cb-s2{transform-origin:50% 100%;animation:cb-pop2 5s ease-out infinite}
.cb-line1{animation:cb-l1 5s linear infinite}
.cb-line2{animation:cb-l2 5s linear infinite}
.cb-eye{animation:cb-blink 1s steps(2,end) infinite}
@keyframes cb-drop{
  0%{opacity:0;transform:translateY(-70px);animation-timing-function:cubic-bezier(.55,0,1,.45)}
  8%{opacity:1;transform:translateY(0);animation-timing-function:ease-out}
  12%{transform:translateY(-16px);animation-timing-function:ease-in}
  16%{transform:translateY(0);animation-timing-function:ease-out}
  19%{transform:translateY(-5px);animation-timing-function:ease-in}
  22%{transform:translateY(0);animation-timing-function:ease-in-out}
  40%{transform:translateY(-5px);animation-timing-function:ease-in-out}
  58%{transform:translateY(0);animation-timing-function:ease-in-out}
  76%{transform:translateY(-5px);animation-timing-function:ease-in-out}
  93%{opacity:1;transform:translateY(0)}
  98%,100%{opacity:0;transform:translateY(0)}
}
@keyframes cb-shadow{
  0%,7%{opacity:0;transform:scale(.3)}
  8%{opacity:1;transform:scale(1)}
  12%{transform:scale(.7)}
  16%{transform:scale(1)}
  19%{transform:scale(.9)}
  22%{transform:scale(1)}
  40%{transform:scale(.85)}
  58%{transform:scale(1)}
  76%{transform:scale(.85)}
  93%{opacity:1;transform:scale(1)}
  98%,100%{opacity:0}
}
@keyframes cb-ring{0%,8%{opacity:0;transform:scale(1)}9%{opacity:.8;transform:scale(1)}40%{opacity:0;transform:scale(4.5)}100%{opacity:0}}
@keyframes cb-pop1{0%,24%{opacity:0;transform:scale(0)}30%{opacity:1;transform:scale(1.25)}34%,93%{opacity:1;transform:scale(1)}98%,100%{opacity:0;transform:scale(1)}}
@keyframes cb-pop2{0%,32%{opacity:0;transform:scale(0)}38%{opacity:1;transform:scale(1.25)}42%,93%{opacity:1;transform:scale(1)}98%,100%{opacity:0;transform:scale(1)}}
@keyframes cb-l1{0%,22%{opacity:0;stroke-dashoffset:0}26%,93%{opacity:1}98%,100%{opacity:0}100%{stroke-dashoffset:-160}}
@keyframes cb-l2{0%,30%{opacity:0;stroke-dashoffset:0}34%,93%{opacity:1}98%,100%{opacity:0}100%{stroke-dashoffset:-160}}
@keyframes cb-blink{0%,100%{opacity:1}50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.cb *{animation:none!important}}
`;

export function CabangHeroAnimation({ className }: { className?: string }) {
  return (
    <div className={className ?? "mt-6 h-24 w-full md:h-28"}>
      <svg
        viewBox="0 0 320 120"
        className="cb h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Peta dengan pin lokasi cabang"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="cb-bg" cx="50%" cy="70%" r="60%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".3" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="cb-clip">
            <rect width="320" height="120" rx="16" />
          </clipPath>
        </defs>

        <rect width="320" height="120" rx="16" fill="#1c1b1b" />
        <g clipPath="url(#cb-clip)">
          <rect width="320" height="120" fill="url(#cb-bg)" />

          {/* Peta: blok bangunan + jalan */}
          <rect x="14" y="14" width="30" height="22" rx="4" fill="#201f1f" />
          <rect x="62" y="10" width="38" height="18" rx="4" fill="#201f1f" />
          <rect x="116" y="12" width="22" height="26" rx="4" fill="#201f1f" />
          <rect x="204" y="8" width="34" height="20" rx="4" fill="#201f1f" />
          <rect x="274" y="14" width="30" height="26" rx="4" fill="#201f1f" />
          <rect x="16" y="86" width="26" height="22" rx="4" fill="#201f1f" />
          <rect x="108" y="100" width="34" height="14" rx="4" fill="#201f1f" />
          <rect x="196" y="98" width="30" height="16" rx="4" fill="#201f1f" />
          <rect x="280" y="92" width="26" height="20" rx="4" fill="#201f1f" />

          <g stroke="#2c2c2c" strokeWidth="2">
            <path d="M0 44 H320" />
            <path d="M0 76 H320" />
            <path d="M52 0 V120" />
            <path d="M108 0 V120" />
            <path d="M246 0 V120" />
          </g>
          <path d="M-10 104 Q90 62 180 82 T330 48" stroke="#3e4a3b" strokeOpacity=".55" strokeWidth="7" strokeLinecap="round" />
          <path d="M-10 104 Q90 62 180 82 T330 48" stroke="#1c1b1b" strokeWidth="1.5" strokeDasharray="6 8" strokeLinecap="round" />

          {/* Rute ke cabang lain */}
          <path className="cb-line1" d="M152 94 Q108 104 70 84" stroke="#61e06a" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" />
          <path className="cb-line2" d="M168 94 Q222 100 256 66" stroke="#61e06a" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 5" />

          {/* Cabang kecil kiri */}
          <g transform="translate(66 60)">
            <g className="cb-s1">
              <path d="M0 24 C-5 17 -10 12 -10 7 C-10 1 -5 -3 0 -3 C5 -3 10 1 10 7 C10 12 5 17 0 24 Z" fill="#ffb84d" />
              <circle cx="0" cy="7" r="3.5" fill="#131313" />
            </g>
          </g>
          {/* Cabang kecil kanan */}
          <g transform="translate(258 38)">
            <g className="cb-s2">
              <path d="M0 24 C-5 17 -10 12 -10 7 C-10 1 -5 -3 0 -3 C5 -3 10 1 10 7 C10 12 5 17 0 24 Z" fill="#8ab4ff" />
              <circle cx="0" cy="7" r="3.5" fill="#131313" />
            </g>
          </g>

          {/* Radar ring + bayangan pin utama */}
          <ellipse className="cb-ring" cx="160" cy="95" rx="12" ry="4" stroke="#61e06a" strokeWidth="2" />
          <ellipse className="cb-ring" cx="160" cy="95" rx="12" ry="4" stroke="#61e06a" strokeWidth="2" style={{ animationDelay: "1.1s" }} />
          <ellipse className="cb-shadow" cx="160" cy="95" rx="12" ry="3.5" fill="#000" opacity=".5" />

          {/* Pin utama */}
          <g transform="translate(0 15)">
            <g className="cb-main">
              <path d="M160 80 C145 60 130 50 130 35 C130 18 145 8 160 8 C175 8 190 18 190 35 C190 50 175 60 160 80 Z" fill="#61e06a" />
              <path d="M142 22 C148 14 158 12 162 12" stroke="#e5e2e1" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
              <circle cx="160" cy="35" r="11" fill="#131313" />
              <circle className="cb-eye" cx="160" cy="35" r="4.5" fill="#61e06a" />
            </g>
          </g>
        </g>

        <rect x="1" y="1" width="318" height="118" rx="15" stroke="#3e4a3b" strokeWidth="2" />
      </svg>
    </div>
  );
}