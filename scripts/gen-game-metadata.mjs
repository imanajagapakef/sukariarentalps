/**
 * Emits supabase/migrations/0017_game_metadata.sql from the Wikidata harvest.
 *
 * Overrides exist where the harvest is demonstrably wrong or imprecise, and each
 * one carries its reason in the generated SQL so the next person can re-check it.
 */
import fs from "node:fs";

const rows = JSON.parse(fs.readFileSync("docs/game-metadata.json", "utf8"));

// game_id -> partial { developer?, publisher?, release_date? } + reason
const OVERRIDES = {
  "GM-001": {
    // Wikidata Q30229306 is the EA/Starbreeze "A Way Out" announced in 2018 and
    // never released. The catalogued game is Hazelight's 2023 co-op release.
    developer: "Hazelight Studios",
    publisher: "EA Originals",
    release_date: "2023-03-23",
    reason: "harvest matched the cancelled 2018 project, not the 2023 game",
  },
  "GM-020": {
    // Wikidata matched the 2023 remake (Q107616212, Motive) which still has no
    // release date. Catalogued as plain "Dead Space" = the 2008 original.
    developer: "EA Montreal",
    publisher: "Electronic Arts",
    release_date: "2008-10-08",
    reason: "harvest matched the 2023 remake, which has no release date",
  },
  "GM-038": { release_date: "2015-06-14", reason: "harvest had day precision missing (2015-06-00)" },
  "GM-058": { release_date: "2022-02-17", reason: "harvest had month+day missing (2020-00-00)" },
  "GM-006": {
    developer: "Ubisoft Quebec",
    publisher: "Ubisoft",
    release_date: "2022-04-21",
    reason: "no Wikidata video-game match",
  },
  "GM-035": {
    developer: "Yager Development",
    publisher: "Yager",
    release_date: "2021-10-21",
    reason: "no Wikidata video-game match",
  },
  // Harvest returned the company for the second field, or nothing at all.
  "GM-013": { developer: "Ubisoft Montreal", publisher: "Ubisoft" },
  "GM-015": { developer: "Hazelight Studios", publisher: "EA Originals" },
  "GM-018": { developer: "Housemarque" },
  "GM-019": { developer: "Rockstar North", publisher: "Rockstar Games" },
  "GM-023": { developer: "Ubisoft Montreal", publisher: "Ubisoft" },
  "GM-026": { developer: "Arrowhead Game Studios" },
  "GM-040": { developer: "Remedy Entertainment", publisher: "Epic Games Publishing" },
  "GM-045": { developer: "Cat-astrophe Games", publisher: "Radiance Interactive" },
  "GM-047": { developer: "DigixArt" },
  "GM-048": { developer: "Reflector Entertainment" },
  "GM-049": { developer: "Code Mystics", publisher: "Aspyr" },
  "GM-007": { publisher: "Activision" },
  "GM-037": { publisher: "Activision" },
  "GM-039": { publisher: "Game Swing" },
  "GM-041": { publisher: "Activision" },
  "GM-046": { publisher: "Ubisoft" },
  "GM-052": { publisher: "Dotemu" },
  "GM-054": { publisher: "Ubisoft" },
};

const q = (v) => (v == null || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const applied = [];
const values = [];
const notes = [];

for (const r of rows) {
  const ov = OVERRIDES[r.game_id] ?? {};
  const developer = ov.developer ?? r.developer ?? null;
  const publisher = ov.publisher ?? r.publisher ?? null;
  const release = ov.release_date ?? r.release_date ?? null;

  if (!developer || !publisher || !release) {
    notes.push(`  -- ${r.game_id} ${r.name}: incomplete (dev=${developer ?? "-"} pub=${publisher ?? "-"} date=${release ?? "-"})`);
  }
  values.push(`    ('${r.game_id}', ${q(developer)}, ${q(publisher)}, ${q(release)})`);
  applied.push({ game_id: r.game_id, developer, publisher, release, reason: ov.reason });
}

const missing = applied.filter(
  (a) => !a.developer || !a.publisher || !a.release,
);

const sql = `-- Game metadata backfill.
--
-- The catalogue shipped with developer / publisher / release_date / age_rating all
-- NULL, so the game-detail metadata block (D5) never rendered a single fact and the
-- genre filter stayed dead.
--
-- Source: Wikidata, harvested per game and verified to resolve to an actual video
-- game (P31 -> Q7889) rather than a film or a series. Each match is recorded in
-- game-metadata.json with its Q-id.
--
-- research_status moves RESEARCH_REQUIRED -> RESEARCHED, not VERIFIED: Wikidata is a
-- crowd source and these values have not been checked against a publisher's own page.
--
-- age_rating is deliberately LEFT NULL. Wikidata stores PEGI (P910) as a rating-item
-- reference rather than a value, and guessing an age rating for an Indonesian rental
-- catalogue is not worth a wrong number on a customer's screen. The UI already omits
-- absent facts.
--
-- Rows needing a human decision are listed at the bottom.

update public.games as g
set developer    = v.developer,
    publisher    = v.publisher,
    -- The VALUES literals are untyped, so Postgres infers text and the assignment to
    -- a date column fails without this cast.
    release_date = v.release_date::date,
    research_status = 'RESEARCHED'
from (values
${values.join(",\n")}
) as v(game_id, developer, publisher, release_date)
where g.game_id = v.game_id;

-- Coverage after this migration:
--   developer    : ${applied.filter((a) => a.developer).length}/58
--   publisher    : ${applied.filter((a) => a.publisher).length}/58
--   release_date : ${applied.filter((a) => a.release).length}/58
--   age_rating   : 0/58 (intentionally left null, see header)
--
-- Still incomplete:
${missing.length ? missing.map((m) => `--   ${m.game_id} ${rows.find((r) => r.game_id === m.game_id).name}: developer=${m.developer ?? "NULL"} publisher=${m.publisher ?? "NULL"} release_date=${m.release ?? "NULL"}`).join("\n") : "--   none"}
--
-- Overrides applied on top of the harvest, with reasons:
${Object.entries(OVERRIDES)
  .filter(([, v]) => v.reason)
  .map(([id, v]) => `--   ${id} (${rows.find((r) => r.game_id === id)?.name}): ${v.reason}`)
  .join("\n")}
`;

fs.writeFileSync("supabase/migrations/0017_game_metadata.sql", sql, "utf8");
console.log(`wrote supabase/migrations/0017_game_metadata.sql`);
console.log(`  developer    ${applied.filter((a) => a.developer).length}/58`);
console.log(`  publisher    ${applied.filter((a) => a.publisher).length}/58`);
console.log(`  release_date ${applied.filter((a) => a.release).length}/58`);
console.log(`  incomplete   ${missing.length}`);
for (const m of missing) {
  console.log(`    ${m.game_id} ${rows.find((r) => r.game_id === m.game_id).name}: dev=${m.developer ?? "NULL"} pub=${m.publisher ?? "NULL"} date=${m.release ?? "NULL"}`);
}
