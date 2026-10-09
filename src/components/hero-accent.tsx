import { cn } from "@/lib/utils";

const stroke = "#61e06a";
const bg = "#1c1b1b";
const strokeMuted = "#3e4a3b";

export function HeroAccent({
  variant,
  className,
}: {
  variant: "controller" | "radar" | "pin" | "gamepad" | "steam" | "coupon" | "headset";
  className?: string;
}) {
  return (
    <div className={cn("h-24 w-full md:h-28", className)}>
      <svg viewBox="0 0 320 120" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="320" height="120" rx="16" fill={bg} stroke={strokeMuted} strokeWidth="2" />
        {variant === "controller" && (
          <g className="animate-bobbing" style={{ transformOrigin: "160px 60px" }}>
            <rect x="80" y="40" width="160" height="50" rx="20" stroke={stroke} strokeWidth="4" fill="#131313" />
            <circle cx="120" cy="65" r="6" fill={stroke} className="animate-blink" />
            <path d="M190 58 L210 65 L190 72 Z" fill={stroke} />
            <path d="M230 55 L230 75 M220 65 L240 65" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
          </g>
        )}
        {variant === "radar" && (
          <g style={{ transformOrigin: "160px 60px" }}>
            <circle cx="160" cy="60" r="38" stroke={stroke} strokeWidth="2" />
            <circle cx="160" cy="60" r="24" stroke={strokeMuted} strokeWidth="2" />
            <circle cx="160" cy="60" r="10" stroke={stroke} strokeWidth="2" />
            <line x1="160" y1="60" x2="196" y2="28" stroke={stroke} strokeWidth="3" className="animate-radar" style={{ transformOrigin: "160px 60px" }} />
          </g>
        )}
        {variant === "pin" && (
          <g className="animate-float">
            <path d="M160 80 C145 60 130 50 130 35 C130 18 145 8 160 8 C175 8 190 18 190 35 C190 50 175 60 160 80 Z" fill={stroke} />
            <circle cx="160" cy="35" r="8" fill="#131313" />
          </g>
        )}
        {variant === "gamepad" && (
          <g className="animate-float">
            <rect x="90" y="30" width="140" height="60" rx="20" stroke={stroke} strokeWidth="4" fill="#131313" />
            <path d="M120 55 L145 55 M132 42 L132 68" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
            <circle cx="190" cy="50" r="5" fill={stroke} className="animate-blink" />
            <circle cx="205" cy="65" r="5" fill={stroke} className="animate-blink" />
          </g>
        )}
        {variant === "steam" && (
          <g>
            <path d="M130 70 Q145 60 160 70 Q175 80 190 70" stroke={stroke} strokeWidth="3" fill="none" />
            <circle cx="120" cy="45" r="3" fill={stroke} className="animate-steam" />
            <circle cx="160" cy="35" r="3" fill={stroke} className="animate-steam" style={{ animationDelay: "0.5s" }} />
            <circle cx="200" cy="45" r="3" fill={stroke} className="animate-steam" style={{ animationDelay: "1s" }} />
          </g>
        )}
        {variant === "coupon" && (
          <g className="animate-coupon" style={{ transformOrigin: "160px 60px" }}>
            <rect x="95" y="30" width="130" height="60" rx="8" fill="#131313" stroke={stroke} strokeWidth="3" />
            <path d="M115 60 L205 60" stroke={stroke} strokeWidth="2" strokeDasharray="6 4" />
            <text x="160" y="55" textAnchor="middle" fill={stroke} fontSize="14" fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700">DISKON</text>
          </g>
        )}
        {variant === "headset" && (
          <g>
            <path d="M100 40 Q160 0 220 40" stroke={stroke} strokeWidth="4" fill="none" className="animate-headset-glow" />
            <rect x="90" y="40" width="30" height="50" rx="10" fill={stroke} />
            <rect x="200" y="40" width="30" height="50" rx="10" fill={stroke} />
            <path d="M220 65 Q240 90 220 95" stroke={stroke} strokeWidth="3" fill="none" />
            <circle cx="220" cy="98" r="4" fill={stroke} className="animate-blink" />
          </g>
        )}
      </svg>
    </div>
  );
}
