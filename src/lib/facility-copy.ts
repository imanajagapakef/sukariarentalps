/**
 * Design copy per facility type code.
 *
 * Lives here rather than in a page because both `/` (PILIH TEMPAT MAIN) and
 * `/cabang/[branch_id]` (ADA APA AJA DI SINI?) render the same per-facility
 * marketing copy from the Stitch design.
 */
export const FACILITY_COPY: Record<
  string,
  { tag: string; players: string; desc: string; cta: string }
> = {
  REGULAR: {
    tag: "PS5 Standard Setup",
    players: "1 - 2 Players",
    desc: "Setup standar seru dengan TV 50\" 4K HDR, 2 stik DualSense responsif, dan kursi busa empuk buat duel sore santai.",
    cta: "Booking Regular",
  },
  CAPSULE: {
    tag: "Acoustic Private",
    players: "1 - 2 Players",
    desc: "Ruang semi-tertutup dengan peredam suara, recliner sofa ergonomis, dan headset Pulse 3D Audio nendang.",
    cta: "Booking Capsule",
  },
  VIP: {
    tag: "Favorit Mabar",
    players: "Max 4 Players",
    desc: "Sofa L-shape empuk muat 4 orang, TV 65\" 120Hz smooth, plus free 2 botol dingin tiap booking minimal 2 jam.",
    cta: "Booking VIP",
  },
  VVIP: {
    tag: "Eksklusif Ganet",
    players: "Up to 6 Players",
    desc: "PS5 Pro + Switch OLED station, minibar pribadi, Dolby Atmos Soundbar, AC khusus, dan complimentary snack basket.",
    cta: "Booking VVIP",
  },
  STEERING: {
    tag: "Gran Turismo Ready",
    players: "1 Player Cockpit",
    desc: "Logitech Force Feedback Wheel & Pedal, bucket seat racing frame. Siap buat adu lap time di Gran Turismo 7 & F1 24.",
    cta: "Gas Sim Rig",
  },
  SWITCH: {
    tag: "Party Mabar",
    players: "Up to 4 Players",
    desc: "4 Joy-Con Controllers siap pakai. Mainkan Mario Kart 8 Deluxe, Mario Party Superstars, dan Super Smash Bros bareng kawan.",
    cta: "Booking Switch",
  },
  PSVR2: {
    tag: "VR Terbaru",
    players: "1 Player Immersive",
    desc: "PlayStation VR2 dengan eye tracking, haptic feedback, dan 3D audio untuk pengalaman imersif maksimal.",
    cta: "Booking PSVR2",
  },
};

type FacilityCopy = { tag: string; players: string; desc: string; cta: string };

/**
 * Copy for a facility code, falling back to a caller-supplied default so each
 * page can word its own unknown-code case (the home page uses the platform as
 * the tag; branch pages use a generic line).
 */
export const facilityCopy = (code: string, fallback: FacilityCopy): FacilityCopy =>
  FACILITY_COPY[code] ?? fallback;
