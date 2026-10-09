/**
 * Generates placeholder artwork for every game and unit, uploads it to the
 * public `media` bucket, and links the resulting URL into `image_url`.
 *
 *   node scripts/generate-media.mjs
 *
 * Idempotent: re-running overwrites both the object and the column, so it is
 * also the repair path for a row whose image was deleted by hand.
 *
 * ponytail: the tints are duplicated from coverTint() in src/lib/format.ts on
 * purpose — the CSS fallback in <Cover> and this art have to agree, and one
 * shared module would drag a server-only env read into a plain node script.
 * If the brand palette changes, change both.
 */
import fs from "node:fs";

const envFile = new URL("../.env.local", import.meta.url);
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const S = env.SUPABASE_SERVICE_ROLE_KEY;
const B = "media";
const H = { apikey: S, Authorization: `Bearer ${S}`, "Content-Type": "application/json" };

if (!U || !S) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local");

const rest = (p) => fetch(`${U}/rest/v1/${p}`, { headers: H }).then((r) => r.json());

// The same seven brand tints as coverTint() in src/lib/format.ts, so the
// generated art and the CSS fallback read as one system.
const TINTS = ["#20a83a", "#1d6f8b", "#8b5a1d", "#6b3fa0", "#a03f5c", "#3f6ba0", "#4d7a2a"];

const hash = (s) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Impact is the closest universally-installed match for the Anton display face
// and is what makes the title read as a poster rather than body copy.
const DISPLAY = "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Anton', sans-serif";
const SANS = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Greedy wrap. Impact averages ~0.52em per char at these sizes. */
function wrap(text, maxW, size, factor = 0.52) {
  const perChar = size * factor;
  const maxChars = Math.max(6, Math.floor(maxW / perChar));
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// ---------------------------------------------------------------- game covers
// The title is burned into the art on purpose: real box art carries the game's
// own logo, and the catalogue listing repeats the name underneath the way a
// storefront does.
function gameCover({ name, platform }) {
  const W = 800,
    H = 1067;
  const h = hash(name);
  const tint = TINTS[h % TINTS.length];
  const angle = 20 + (h % 5) * 14;
  const r1 = 210 + (h % 4) * 46;
  const cx = 400 + ((h >> 3) % 5) * 56 - 140;
  const cy = 430 + ((h >> 6) % 4) * 50;

  const maxW = W - 120;
  const size = name.length > 26 ? 74 : name.length > 16 ? 86 : 98;
  const lines = wrap(name, maxW, size);
  const blockH = lines.length * size * 0.92;
  const startY = H - 96 - blockH + size * 0.2;

  const stripes = Array.from({ length: 9 }, (_, i) => {
    const off = i * 96 - 200;
    return `<rect x="${off}" y="-260" width="26" height="${H + 520}" fill="${tint}" opacity="0.16" transform="rotate(${angle} ${W / 2} ${H / 2})"/>`;
  }).join("");

  const title = lines
    .map(
      (l, i) =>
        `<text x="60" y="${(startY + i * size * 0.92).toFixed(1)}" font-family="${DISPLAY}" font-size="${size}" fill="#f7f7f2" letter-spacing="1.5">${esc(l)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(name)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#131313"/>
      <stop offset="1" stop-color="#0e0e0e"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0.35" x2="0" y2="1">
      <stop offset="0" stop-color="#0e0e0e" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#0e0e0e" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#0e0e0e" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g>${stripes}</g>
  <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${tint}" stroke-width="3" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy}" r="${(r1 * 0.62).toFixed(0)}" fill="${tint}" opacity="0.18"/>
  <path d="M40 ${H - 30} L${W - 40} ${H - 30} L${W - 40} ${H - 26} L40 ${H - 26} Z" fill="${tint}"/>
  <rect width="${W}" height="${H}" fill="url(#scrim)"/>
  <g>
    <rect x="60" y="64" width="${Math.max(150, platform.length * 17 + 54)}" height="52" rx="10" fill="#0e0e0e" stroke="${tint}" stroke-width="2.5"/>
    <text x="${60 + 26}" y="98" font-family="${SANS}" font-size="25" font-weight="700" fill="${tint}" letter-spacing="2">${esc(platform.toUpperCase())}</text>
  </g>
  <g>
    <text x="60" y="${H - 118}" font-family="${SANS}" font-size="24" font-weight="700" fill="${tint}" letter-spacing="5">KLUB SUKARIA</text>
  </g>
  ${title}
  <rect x="0" y="0" width="${W}" height="14" fill="${tint}"/>
</svg>`;
}

// --------------------------------------------------------------- unit "photos"
// Deliberately text-free. These stand in for a photo of the booth, and the
// station card already prints the unit name, platform and status right beside
// the image — burning the same words into the art read as a bug, not as detail.
function unitCover({ seed }) {
  const W = 1200,
    H = 800;
  const h = hash(seed);
  const tint = TINTS[h % TINTS.length];

  // Vanishing point sits off-centre per unit so two booths never read identical.
  const vx = 420 + (h % 7) * 60;
  const v = 300;

  const lines = [];
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * W;
    lines.push(`<line x1="${x}" y1="${H}" x2="${vx}" y2="${v}" stroke="${tint}" stroke-width="2" opacity="0.18"/>`);
  }
  for (let i = 1; i <= 4; i++) {
    const y = v + Math.pow(i / 4, 2.1) * (H - v);
    lines.push(`<line x1="0" y1="${y.toFixed(0)}" x2="${W}" y2="${y.toFixed(0)}" stroke="${tint}" stroke-width="2" opacity="0.13"/>`);
  }

  // Desk slab: back edge narrower than the front, both centred on the vanishing
  // point, so the top face reads as a surface receding into the room.
  const deskTop = v + 150;
  const deskBot = v + 250;
  const bw = 300,
    fw = 620;
  const cl = (n) => Math.max(-60, Math.min(W + 60, n));
  const desk = [
    `M${cl(vx - bw)} ${deskTop}`,
    `L${cl(vx + bw)} ${deskTop}`,
    `L${cl(vx + fw)} ${deskBot}`,
    `L${cl(vx - fw)} ${deskBot}`,
    "Z",
  ].join(" ");

  // Two lit screens on the desk.
  const monitor = (x) => `
      <rect x="${x - 96}" y="${deskTop - 132}" width="192" height="124" rx="8" fill="#080808" stroke="${tint}" stroke-width="2.5" opacity="0.95"/>
      <rect x="${x - 82}" y="${deskTop - 118}" width="164" height="96" rx="4" fill="${tint}" opacity="0.5"/>
      <rect x="${x - 8}" y="${deskTop - 8}" width="16" height="10" fill="${tint}" opacity="0.75"/>`;

  // Foreground chair backs, cropped by the bottom edge.
  const chair = (x) => `
      <path d="M${x - 78} ${H} L${x - 78} ${H - 118} Q${x - 78} ${H - 196} ${x} ${H - 196} Q${x + 78} ${H - 196} ${x + 78} ${H - 118} L${x + 78} ${H} Z" fill="#0b0b0b" stroke="${tint}" stroke-width="2" opacity="0.92"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ruang ${esc(seed)}">
  <defs>
    <linearGradient id="u" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#201f1f"/>
      <stop offset="0.6" stop-color="#131313"/>
      <stop offset="1" stop-color="#0e0e0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="screen" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#u)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g>${lines.join("")}</g>
  <rect x="0" y="0" width="${W}" height="10" fill="${tint}"/>
  <ellipse cx="${vx}" cy="${deskTop - 70}" rx="300" ry="130" fill="url(#screen)"/>
  <path d="${desk}" fill="#0b0b0b" stroke="${tint}" stroke-width="2.5" opacity="0.95"/>
  <g>${monitor(vx - 150)}${monitor(vx + 150)}</g>
  <g>${chair(vx - 330)}${chair(vx + 330)}</g>
</svg>`;
}

// -------------------------------------------------------------- snack "photos"
// Text-free for the same reason unitCover is: the snack card prints the name
// right beside the image, and a photo of popcorn does not have "Popcorn"
// written across it. What distinguishes them is the silhouette, chosen from
// the category so a menu reads as food / drinks / combos at a glance.
function snackCover({ seed, category }) {
  const W = 1200,
    H = 900;
  const h = hash(seed);
  const tint = TINTS[h % TINTS.length];
  // Jitter is kept small. The silhouette is the subject; enough variation to tell
  // two snacks apart, not enough to push it into a corner of the frame.
  const cx = W / 2 + (((h >> 3) % 5) - 2) * 34;
  const cy = 470 + ((h >> 6) % 3) * 26;

  // DRINK and COMBO are tall/stacked; everything else is a wide bowl.
  const tall = category === "DRINK";
  const shape =
    category === "COMBO"
      ? `<g><rect x="${cx - 290}" y="${cy - 210}" width="440" height="230" rx="26" fill="#0b0b0b" stroke="${tint}" stroke-width="6"/>
           <rect x="${cx - 210}" y="${cy - 320}" width="440" height="230" rx="26" fill="#141414" stroke="${tint}" stroke-width="6"/></g>`
      : tall
        ? `<g><rect x="${cx - 110}" y="${cy - 300}" width="220" height="470" rx="26" fill="#0b0b0b" stroke="${tint}" stroke-width="6"/>
           <rect x="${cx - 74}" y="${cy - 440}" width="148" height="150" rx="16" fill="${tint}" opacity="0.4"/></g>`
        : `<g><path d="M${cx - 300} ${cy - 190} Q${cx} ${cy + 250} ${cx + 300} ${cy - 190} Z" fill="#0b0b0b" stroke="${tint}" stroke-width="6"/>
           <ellipse cx="${cx}" cy="${cy - 190}" rx="300" ry="66" fill="${tint}" opacity="0.4"/></g>`;

  const bubbles = Array.from({ length: 16 }, (_, i) => {
    const a = ((h >> i) % 360) * (Math.PI / 180);
    const rr = 170 + ((h >> (i % 12)) % 9) * 62;
    return `<circle cx="${(W / 2 + Math.cos(a) * rr).toFixed(1)}" cy="${(H / 2 + Math.sin(a) * rr * 0.6).toFixed(1)}" r="${(8 + (i % 4) * 7).toFixed(1)}" fill="${tint}" opacity="0.13"/>`;
  }).join("");

  // Counter surface, so the item sits somewhere instead of floating.
  const surface = `<ellipse cx="${cx}" cy="${cy + 300}" rx="${tall ? 210 : 380}" ry="46" fill="#000" opacity="0.45"/>
    <rect x="0" y="${cy + 300}" width="${W}" height="${H - (cy + 300)}" fill="#0b0b0b" opacity="0.55"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="menu item">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.9"/>
      <stop offset="0.6" stop-color="#131313"/>
      <stop offset="1" stop-color="#0e0e0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g>${bubbles}</g>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${surface}
  ${shape}
  <rect x="0" y="0" width="${W}" height="10" fill="${tint}"/>
</svg>`;
}

// ------------------------------------------------------------------------ main
const games = await rest(
  "games?select=game_id,name,slug,game_platforms(platform_id,platforms(name))&active=eq.true&order=game_id",
);
const units = await rest("units?select=unit_id,name,branch_id&order=unit_id");
// Snacks only. branches.image_url is selected by getBranches() but no component
// renders it, so generating branch art would upload 2 files nothing displays.
// Add branches here in the same commit that gives the column a consumer.
const snacks = await rest("snacks?select=snack_id,name,category&order=snack_id");

async function put(path, svg) {
  const res = await fetch(`${U}/storage/v1/object/${B}/${path}`, {
    method: "POST",
    headers: {
      apikey: S,
      Authorization: `Bearer ${S}`,
      "Content-Type": "image/svg+xml",
      "x-upsert": "true",
    },
    body: svg,
  });
  if (!res.ok) throw new Error(`${path}: ${(await res.text()).slice(0, 140)}`);
  return `${U}/storage/v1/object/public/${B}/${path}`;
}

async function link(table, id, url) {
  // The primary key name differs per table, so it is passed in rather than
  // guessed from the table name.
  const key = { games: "game_id", units: "unit_id", snacks: "snack_id" }[table];
  if (!key) throw new Error(`link(): no primary key known for ${table}`);
  const r = await fetch(`${U}/rest/v1/${table}?${key}=eq.${id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ image_url: url }),
  });
  if (!r.ok) throw new Error(`db ${table} ${id}: ${(await r.text()).slice(0, 140)}`);
}

let n = 0;
for (const g of games) {
  const platform = g.game_platforms?.[0]?.platforms?.name ?? "PS5";
  const url = await put(`games/${g.game_id}/cover.svg`, gameCover({ name: g.name, platform }));
  await link("games", g.game_id, url);
  n++;
}
console.log(`games: ${n} covers generated + linked`);

let m = 0;
for (const u of units) {
  const url = await put(`units/${u.unit_id}/booth.svg`, unitCover({ seed: u.unit_id + u.name }));
  await link("units", u.unit_id, url);
  m++;
}
console.log(`units: ${m} booth images generated + linked`);

let k = 0;
for (const s of snacks) {
  const url = await put(`snacks/${s.snack_id}/item.svg`, snackCover({ seed: s.snack_id + s.name, category: s.category }));
  await link("snacks", s.snack_id, url);
  k++;
}
console.log(`snacks: ${k} menu images generated + linked`);
