/**
 * Emits supabase/migrations/0018_game_features.sql from the Wikidata harvest.
 *
 * Genre: mapped from P136 to the coarse catalogue vocabulary the app already uses
 * (uppercase, slash-joined). Two games have no Wikidata match and are hand-entered.
 *
 * Mode flags: taken from P404 game-mode claims —
 *   single-player  -> single_player
 *   multiplayer    -> online_multiplayer
 *   co-op mode     -> co_op
 *   player vs player -> competitive
 *   shared/splitscreen -> local_multiplayer
 *
 * ponytail: `local_multiplayer` is the field a console-rental shop cares about most,
 * and Wikidata only carries splitscreen data for 3 of 58 titles. So it is sourced
 * where available and otherwise set from a short, explicit override list — each entry
 * there is a judgement, not a citation, and the list is printed at the bottom of the
 * migration so it can be audited.
 */
import fs from "node:fs";

const cache = JSON.parse(fs.readFileSync("wikidata-cache.json", "utf8"));
const prev = JSON.parse(fs.readFileSync("docs/game-metadata.json", "utf8"));

const ids = (c, p) => (c?.[p] ?? []).map((x) => x.mainsnak?.datavalue?.value?.id).filter(Boolean);
const label = (id) => cache.labels[id] ?? null;
const hasMode = (c, l) => ids(c, "P404").some((id) => cache.labels[id] === l);

const M = {
  single: "single-player video game",
  multi: "multiplayer video game",
  coop: "co-op mode",
  pvp: "player versus player",
  split: "shared/splitscreen multiplayer",
};

// Wikidata genre label -> catalogue vocabulary. Anything unmapped is reported rather
// than guessed, so the list below is the whole contract.
const GENRE = {
  "action-adventure game": "ACTION/ADVENTURE",
  "adventure video game": "ADVENTURE",
  "action game": "ACTION",
  "action role-playing game": "ACTION/RPG",
  "role-playing video game": "RPG",
  soulslike: "ACTION/RPG",
  "dark fantasy video game": "ACTION/RPG",
  "first-person shooter": "SHOOTER",
  "third-person shooter": "SHOOTER",
  "shooter game": "SHOOTER",
  "rail shooter": "SHOOTER",
  "horde shooter": "SHOOTER",
  "hero shooter": "SHOOTER",
  "computer wargame": "SHOOTER",
  "survival horror": "SURVIVAL HORROR",
  "racing video game": "RACING",
  "kart racing game": "RACING",
  "arcade racing game": "RACING",
  "motorcycle video game": "RACING",
  "mascot racer": "RACING",
  "extreme sports video game": "SPORT",
  "association football video game": "SPORT",
  "basketball video game": "SPORT",
  "sports video game": "SPORT",
  "tennis video game": "SPORT",
  "fighting game": "FIGHTING",
  "3D fighting game": "FIGHTING",
  "2D fighting game": "FIGHTING",
  "arena fighter": "FIGHTING",
  "party video game": "PARTY",
  "dodgeball video game": "PARTY",
  platformer: "PLATFORMER",
  "puzzle-platformer": "PLATFORMER/PUZZLE",
  "casual game": "CASUAL",
  "dance video game": "MUSIC",
  "music video game": "MUSIC",
  "rhythm game": "MUSIC",
  "beat 'em up": "ACTION",
  "retro-style video game": "ACTION",
  "stealth game": "ACTION/ADVENTURE",
  "cyberpunk video game": "ACTION/ADVENTURE",
  "simulation video game": "SIMULATION",
};
// Not genres — Wikidata classifies these as genres but they describe content or art
// style, and putting them in a filter would be noise.
const DROP = new Set(["video game with LGBT character", "science fiction video game"]);

// No Wikidata match for these two.
const MANUAL = {
  "GM-006": { genre: "PARTY" },
  "GM-035": { genre: "FIGHTING" },
};

/**
 * local_multiplayer judgements. Wikidata has splitscreen for only 3 titles, so couch
 * play — the thing that decides whether a group books this console — is hand-set here.
 * Values: player count on one screen.
 *
 * Deliberately conservative: this list is a subset, not an exhaustive claim. Missing an
 * entry reads as "no couch play" and loses a sale; a wrong entry strands a group that
 * arrives expecting two players on one screen. Where I was not confident the entry is
 * absent — notably GM-004 EA Sports FC 25, whose local modes have changed across
 * editions, and GM-005 Marvel Rivals and GM-019 GTA V, which have no couch play at all.
 */
const LOCAL = {
  "GM-001": 2, "GM-003": 2, "GM-007": 4, "GM-008": 6, "GM-009": 4,
  "GM-010": 4, "GM-011": 4, "GM-012": 2, "GM-014": 2, "GM-015": 2, "GM-017": 4,
  "GM-022": 2, "GM-023": 2, "GM-025": 4, "GM-029": 2, "GM-033": 2, "GM-036": 4,
  "GM-039": 4, "GM-042": 2, "GM-043": 4, "GM-045": 2, "GM-046": 2, "GM-050": 4,
  "GM-051": 2, "GM-052": 4, "GM-053": 2, "GM-054": 4, "GM-055": 4, "GM-056": 2,
  "GM-057": 4, "GM-058": 4,
};

/**
 * Mode-flag corrections where the sourced P404 claim is wrong. Each carries a reason.
 * Left out of LOCAL and corrected here: Marvel Rivals is an online-only hero PvP
 * shooter, so "co-op mode" and "splitscreen" on its Wikidata item are both wrong.
 */
const MODE_OVERRIDES = {
  "GM-005": { co_op: false, local_multiplayer: false, reason: "online-only hero PvP; Wikidata's co-op mode claim is wrong" },
  "GM-019": { local_multiplayer: false, reason: "GTA V has no couch play; story mode is single-player" },
};

const unmapped = new Set();
const rows = [];

for (const r of prev) {
  const c = r.qid ? cache.claims[r.qid] : null;
  const manual = MANUAL[r.game_id] ?? null;

  let genre = manual?.genre ?? null;
  if (!genre && c) {
    for (const id of ids(c, "P136")) {
      const l = label(id);
      if (!l || DROP.has(l)) continue;
      const mapped = GENRE[l];
      if (!mapped) {
        unmapped.add(l);
        continue;
      }
      genre = mapped;
      break; // first mapped P136 is the primary genre
    }
  }

  const coOp = c ? hasMode(c, M.coop) : false;
  const single = c ? hasMode(c, M.single) : false;
  const multi = c ? hasMode(c, M.multi) : false;
  const competitive = c ? hasMode(c, M.pvp) : false;
  const splitSourced = c ? hasMode(c, M.split) : false;
  const localPlayers = LOCAL[r.game_id] ?? null;
  const mo = MODE_OVERRIDES[r.game_id] ?? null;
  const local = mo?.local_multiplayer ?? (splitSourced || localPlayers != null);
  const coOpFinal = mo?.co_op ?? coOp;

  // Co-op-only titles carry the co-op tag in the genre, matching the values the
  // catalogue already used ("ADVENTURE/CO-OP", "PARTY/CO-OP").
  if (genre && coOpFinal && !single && !genre.includes("CO-OP")) genre = `${genre}/CO-OP`;

  rows.push({
    game_id: r.game_id,
    genre,
    local_multiplayer: local,
    online_multiplayer: multi,
    co_op: coOpFinal,
    competitive,
    single_player: single,
    max_local_players: local ? localPlayers : null,
    recommended_players: null,
    psvr2: false,
  });
}

const yn = (b) => (b ? "true" : "false");
const lit = (v) => (v == null ? "NULL" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v));

const values = rows
  .map(
    (r) =>
      `    ('${r.game_id}', ${lit(r.genre)}, ${yn(r.local_multiplayer)}, ${yn(r.online_multiplayer)}, ${yn(r.co_op)}, ${yn(r.competitive)}, ${yn(r.single_player)}, ${lit(r.max_local_players)}, ${yn(r.psvr2)})`,
  )
  .join(",\n");

const counts = (k) => rows.filter((r) => r[k]).length;

const sql = `-- Game features backfill (the companion to 0017_game_metadata.sql).
--
-- Why: the genre filter has been dead since launch because game_features covered only
-- 6 of 58 games, and the game-detail multiplayer block only renders when a row exists.
--
-- Source: Wikidata. Genre is P136 mapped into the catalogue's coarse vocabulary
-- (uppercase, slash-joined) by scripts/gen-game-features.mjs; the mode flags are P404
-- game-mode claims, mapped one to one:
--   single-player -> single_player      multiplayer  -> online_multiplayer
--   co-op mode    -> co_op              PvP          -> competitive
--   shared/splitscreen -> local_multiplayer
--
-- Two games have no Wikidata match (GM-006 Rabbids Party of Legends, GM-035 Undisputed)
-- and carry a hand-entered genre.
--
-- CAVEAT — local_multiplayer is the field a console-rental shop cares about most, and
-- Wikidata carries splitscreen data for only 3 of 58 titles. The rest come from an
-- explicit judgement list in the generator, printed below. They are the least
-- trustworthy values in this migration; review them before trusting the "cocok buat
-- mabar" signal.
--
-- max_local_players is null unless the judgement list supplied a count, rather than
-- defaulting to a number that was never established.
-- recommended_players is left null throughout: the columns are not null-constrained in
-- a way that helps here, and a fabricated recommendation is worse than none.

-- recommended_players and research_status are intentionally absent from the column
-- list: recommended_players takes its NULL default (a fabricated recommendation is
-- worse than none) and research_status is set in the upsert clause below, so the
-- VALUES tuples stay a fixed width.
insert into public.game_features (
  game_id, genre, local_multiplayer, online_multiplayer, co_op, competitive,
  single_player, max_local_players, psvr2
)
values
${values}
on conflict (game_id) do update set
  genre               = excluded.genre,
  local_multiplayer   = excluded.local_multiplayer,
  online_multiplayer  = excluded.online_multiplayer,
  co_op               = excluded.co_op,
  competitive         = excluded.competitive,
  single_player       = excluded.single_player,
  max_local_players   = excluded.max_local_players,
  psvr2               = excluded.psvr2,
  research_status     = 'RESEARCHED'
;

-- Coverage after this migration:
--   genre              : ${rows.filter((r) => r.genre).length}/58
--   single_player      : ${counts("single_player")}/58
--   online_multiplayer : ${counts("online_multiplayer")}/58
--   co_op              : ${counts("co_op")}/58
--   competitive        : ${counts("competitive")}/58
--   local_multiplayer  : ${counts("local_multiplayer")}/58  (3 sourced, rest judged)
--   max_local_players  : ${rows.filter((r) => r.max_local_players != null).length}/58
--
-- local_multiplayer judgements (game_id: players on one screen):
${Object.entries(LOCAL)
  .map(([g, n]) => `--   ${g}: ${n}`)
  .join("\n")}
--
-- Mode-flag corrections on top of the sourced P404 claims:
${Object.entries(MODE_OVERRIDES)
  .map(([g, v]) => `--   ${g}: ${v.reason}`)
  .join("\n")}
${
  unmapped.size
    ? `\n-- WARNING: unmapped Wikidata genre labels encountered, check the generator:\n${[...unmapped].map((l) => `--   ${l}`).join("\n")}\n`
    : "-- Every Wikidata genre label was covered by the mapping (no unmapped labels).\n"
}`;

fs.writeFileSync("supabase/migrations/0018_game_features.sql", sql, "utf8");
console.log("wrote supabase/migrations/0018_game_features.sql");
console.log(`  rows                : ${rows.length}`);
console.log(`  genre               : ${rows.filter((r) => r.genre).length}/${rows.length}`);
console.log(`  single_player       : ${counts("single_player")}`);
console.log(`  online_multiplayer  : ${counts("online_multiplayer")}`);
console.log(`  co_op               : ${counts("co_op")}`);
console.log(`  competitive         : ${counts("competitive")}`);
console.log(`  local_multiplayer   : ${counts("local_multiplayer")} (sourced ${rows.filter((r) => r.max_local_players == null && r.local_multiplayer).length === 0 ? "?" : ""})`);
console.log(`  unmapped genre labels: ${unmapped.size ? [...unmapped].join(", ") : "none"}`);
console.log(`  distinct genres     : ${[...new Set(rows.map((r) => r.genre))].sort().join(" | ")}`);
