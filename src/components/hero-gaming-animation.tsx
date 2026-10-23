const CSS = `
.hg *{transform-box:fill-box}
.hg-tv{animation:hg-glow 3.2s ease-in-out infinite}
.hg-beam{animation:hg-beam 3.2s ease-in-out infinite}
.hg-ground{animation:hg-ground .5s linear infinite}
.hg-coins{animation:hg-coins .75s linear infinite}
.hg-obs{animation:hg-obs 3s linear infinite}
.hg-run{animation:hg-run .25s steps(2,end) infinite}
.hg-j1{animation:hg-j1 3s linear infinite}
.hg-j2{animation:hg-j2 3s linear infinite}
.hg-c1{transform-origin:50% 100%;animation:hg-c1 3s ease-in-out infinite}
.hg-c2{transform-origin:50% 100%;animation:hg-c2 3s ease-in-out infinite}
.hg-p1{animation:hg-p1 3s ease-out infinite}
.hg-p2{animation:hg-p2 3s ease-out infinite}
.hg-btn{animation:hg-blink 1.1s steps(2,end) infinite}
.hg-star{animation:hg-blink 1.8s steps(2,end) infinite}
.hg-drift{animation:hg-drift 6s ease-in infinite}
@keyframes hg-glow{0%,100%{filter:drop-shadow(0 0 6px rgba(97,224,106,.25))}50%{filter:drop-shadow(0 0 18px rgba(97,224,106,.65))}}
@keyframes hg-beam{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes hg-ground{to{transform:translateX(-24px)}}
@keyframes hg-coins{to{transform:translateX(-60px)}}
@keyframes hg-obs{to{transform:translateX(-240px)}}
@keyframes hg-run{0%{transform:translateY(0)}100%{transform:translateY(-2px)}}
@keyframes hg-j1{0%,62%{transform:translateY(0);animation-timing-function:ease-out}71%{transform:translateY(-30px);animation-timing-function:ease-in}80%,100%{transform:translateY(0)}}
@keyframes hg-j2{0%,44%{transform:translateY(0);animation-timing-function:ease-out}53%{transform:translateY(-30px);animation-timing-function:ease-in}62%,100%{transform:translateY(0)}}
@keyframes hg-c1{0%,64%{transform:translateY(0) rotate(0)}73%{transform:translateY(-8px) rotate(-3deg)}82%,100%{transform:translateY(0) rotate(0)}}
@keyframes hg-c2{0%,46%{transform:translateY(0) rotate(0)}55%{transform:translateY(-8px) rotate(3deg)}64%,100%{transform:translateY(0) rotate(0)}}
@keyframes hg-p1{0%,64%{opacity:0;transform:translateY(0)}68%{opacity:1}84%,100%{opacity:0;transform:translateY(-48px)}}
@keyframes hg-p2{0%,46%{opacity:0;transform:translateY(0)}50%{opacity:1}66%,100%{opacity:0;transform:translateY(-48px)}}
@keyframes hg-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes hg-drift{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-80px)}}
@media (prefers-reduced-motion:reduce){.hg *{animation:none!important}}
`;

const SPARKS = [
  { x: 70, y: 150, d: "0s", s: 4 },
  { x: 410, y: 130, d: "1.4s", s: 5 },
  { x: 40, y: 230, d: "2.6s", s: 3 },
  { x: 440, y: 220, d: "3.8s", s: 4 },
  { x: 95, y: 60, d: "4.6s", s: 3 },
  { x: 395, y: 50, d: "2s", s: 3 },
];

const COINS = [150, 210, 270, 330, 390];

export function HeroGamingAnimation() {
  return (
    <div className="relative h-64 w-full md:absolute md:right-8 md:top-1/2 md:h-105 md:w-120 md:-translate-y-1/2">
      <svg
        viewBox="0 0 480 420"
        className="hg h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Dua teman main game co-op di sofa"
      >
        <style>{CSS}</style>
        <defs>
          <radialGradient id="hg-bg" cx="50%" cy="25%" r="60%">
            <stop offset="0" stopColor="#20a83a" stopOpacity=".35" />
            <stop offset="1" stopColor="#20a83a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hg-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#61e06a" stopOpacity=".28" />
            <stop offset="1" stopColor="#61e06a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hg-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c1c10" />
            <stop offset="1" stopColor="#1d3a22" />
          </linearGradient>
          <pattern id="hg-scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="1" fill="#000" opacity=".28" />
          </pattern>
          <pattern id="hg-gnd" width="24" height="22" patternUnits="userSpaceOnUse">
            <rect width="24" height="22" fill="#173120" />
            <rect x="4" y="8" width="8" height="3" fill="#20a83a" opacity=".6" />
            <rect x="16" y="15" width="5" height="3" fill="#20a83a" opacity=".35" />
          </pattern>
          <clipPath id="hg-screen">
            <rect x="132" y="32" width="216" height="116" rx="8" />
          </clipPath>
        </defs>

        {/* Ambient glow + light spill dari TV */}
        <ellipse cx="240" cy="100" rx="230" ry="190" fill="url(#hg-bg)" />
        <polygon className="hg-beam" points="150,160 330,160 450,320 30,320" fill="url(#hg-beam)" />

        {/* Pixel sparkles */}
        {SPARKS.map((p, i) => (
          <rect
            key={i}
            className="hg-drift"
            x={p.x}
            y={p.y}
            width={p.s}
            height={p.s}
            fill="#61e06a"
            style={{ animationDelay: p.d }}
          />
        ))}

        {/* TV + console */}
        <rect x="225" y="160" width="30" height="12" fill="#201f1f" />
        <rect x="90" y="170" width="300" height="12" rx="6" fill="#201f1f" stroke="#3e4a3b" strokeWidth="2" />
        <rect className="hg-tv" x="120" y="20" width="240" height="140" rx="14" fill="#131313" stroke="#3e4a3b" strokeWidth="4" />
        <rect x="132" y="32" width="216" height="116" rx="8" fill="url(#hg-sky)" />

        {/* Game: endless co-op runner */}
        <g clipPath="url(#hg-screen)">
          <rect className="hg-star" x="170" y="52" width="2" height="2" fill="#e5e2e1" />
          <rect className="hg-star" x="268" y="62" width="2" height="2" fill="#e5e2e1" style={{ animationDelay: ".6s" }} />
          <rect className="hg-star" x="318" y="48" width="2" height="2" fill="#e5e2e1" style={{ animationDelay: "1.1s" }} />

          <g className="hg-ground">
            <rect x="132" y="126" width="264" height="22" fill="url(#hg-gnd)" />
          </g>
          <rect x="132" y="125" width="216" height="2" fill="#61e06a" />

          {/* coin */}
          <g className="hg-coins">
            {COINS.map((x) => (
              <g key={x}>
                <circle cx={x} cy="82" r="5" fill="#ffb84d" />
                <rect x={x - 1} y="79" width="2" height="6" fill="#fff3d1" opacity=".8" />
              </g>
            ))}
          </g>

          {/* obstacle */}
          <g className="hg-obs">
            <rect x="348" y="114" width="12" height="12" rx="2" fill="#ff6b6b" />
            <rect x="351" y="117" width="3" height="3" fill="#131313" />
          </g>

          {/* P2 (amber) */}
          <g transform="translate(222 126)">
            <g className="hg-j2">
              <g className="hg-run">
                <rect x="-6" y="-12" width="12" height="12" rx="2" fill="#ffb84d" />
                <rect x="-3" y="-15" width="6" height="3" fill="#ffb84d" />
                <rect x="1" y="-9" width="3" height="3" fill="#131313" />
              </g>
            </g>
          </g>
          {/* P1 (green) */}
          <g transform="translate(180 126)">
            <g className="hg-j1">
              <g className="hg-run">
                <rect x="-6" y="-12" width="12" height="12" rx="2" fill="#61e06a" />
                <rect x="-3" y="-15" width="6" height="3" fill="#61e06a" />
                <rect x="1" y="-9" width="3" height="3" fill="#131313" />
              </g>
            </g>
          </g>

          {/* HUD */}
          <text x="142" y="48" fill="#61e06a" fontSize="9" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700">P1 ♥♥♥</text>
          <text x="338" y="48" textAnchor="end" fill="#ffb84d" fontSize="9" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700">♥♥♥ P2</text>
          <text x="240" y="48" textAnchor="middle" fill="#bdcab7" fontSize="9" fontFamily="ui-monospace, Menlo, monospace">co-op</text>

          {/* CRT scanlines + glare */}
          <rect x="132" y="32" width="216" height="116" fill="url(#hg-scan)" />
          <polygon points="132,32 220,32 160,148 132,148" fill="#fff" opacity=".04" />
        </g>

        {/* Sofa */}
        <rect x="52" y="248" width="376" height="76" rx="26" fill="#1c1b1b" stroke="#3e4a3b" strokeWidth="3" />
        <rect x="40" y="300" width="400" height="58" rx="18" fill="#232222" stroke="#3e4a3b" strokeWidth="3" />
        <rect x="26" y="276" width="38" height="90" rx="16" fill="#1c1b1b" stroke="#3e4a3b" strokeWidth="3" />
        <rect x="416" y="276" width="38" height="90" rx="16" fill="#1c1b1b" stroke="#3e4a3b" strokeWidth="3" />
        <line x1="240" y1="304" x2="240" y2="354" stroke="#3e4a3b" strokeWidth="2" />
        <rect x="52" y="364" width="14" height="12" rx="3" fill="#131313" />
        <rect x="414" y="364" width="14" height="12" rx="3" fill="#131313" />

        {/* Player 1 */}
        <g className="hg-c1">
          <rect x="94" y="276" width="52" height="50" rx="22" fill="#20a83a" />
          <circle cx="120" cy="262" r="22" fill="#e5e2e1" />
          <path d="M98 258 Q120 234 142 258 Z" fill="#61e06a" />
          <circle cx="120" cy="238" r="4" fill="#61e06a" />
          <circle cx="112" cy="263" r="3" fill="#201f1f" />
          <circle cx="128" cy="263" r="3" fill="#201f1f" />
          <circle cx="113" cy="261.5" r="1" fill="#61e06a" />
          <circle cx="129" cy="261.5" r="1" fill="#61e06a" />
          <ellipse cx="120" cy="273" rx="4" ry="3" fill="#201f1f" />
          <path d="M104 298 Q98 320 122 320" stroke="#20a83a" strokeWidth="10" strokeLinecap="round" />
          <path d="M136 298 Q142 320 118 320" stroke="#20a83a" strokeWidth="10" strokeLinecap="round" />
          <rect x="100" y="312" width="40" height="16" rx="8" fill="#353534" />
          <circle className="hg-btn" cx="128" cy="320" r="3" fill="#61e06a" />
          <rect x="108" y="319" width="8" height="2" fill="#61e06a" opacity=".6" />
          <g className="hg-p1">
            <circle cx="132" cy="304" r="5" stroke="#61e06a" strokeWidth="2" />
          </g>
        </g>

        {/* Player 2 */}
        <g className="hg-c2">
          <rect x="334" y="276" width="52" height="50" rx="22" fill="#d98a14" />
          <circle cx="360" cy="262" r="22" fill="#e5e2e1" />
          <path d="M338 258 Q360 234 382 258 Z" fill="#ffb84d" />
          <rect x="357" y="232" width="6" height="8" rx="2" fill="#ffb84d" />
          <circle cx="352" cy="263" r="3" fill="#201f1f" />
          <circle cx="368" cy="263" r="3" fill="#201f1f" />
          <circle cx="353" cy="261.5" r="1" fill="#61e06a" />
          <circle cx="369" cy="261.5" r="1" fill="#61e06a" />
          <ellipse cx="360" cy="273" rx="4" ry="3" fill="#201f1f" />
          <path d="M344 298 Q338 320 362 320" stroke="#d98a14" strokeWidth="10" strokeLinecap="round" />
          <path d="M376 298 Q382 320 358 320" stroke="#d98a14" strokeWidth="10" strokeLinecap="round" />
          <rect x="340" y="312" width="40" height="16" rx="8" fill="#353534" />
          <circle className="hg-btn" cx="368" cy="320" r="3" fill="#ffb84d" style={{ animationDelay: ".4s" }} />
          <rect x="348" y="319" width="8" height="2" fill="#ffb84d" opacity=".6" />
          <g className="hg-p2">
            <path d="M372 308 L380 296 L364 296 Z" stroke="#ffb84d" strokeWidth="2" strokeLinejoin="round" />
          </g>
        </g>

        {/* Bantal sofa */}
        <rect x="196" y="316" width="48" height="34" rx="12" fill="#20a83a" opacity=".85" transform="rotate(-8 220 333)" />
      </svg>
    </div>
  );
}