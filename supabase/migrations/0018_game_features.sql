-- Game features backfill (the companion to 0017_game_metadata.sql).
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
    ('GM-001', 'ACTION/ADVENTURE/CO-OP', true, false, true, false, false, 2, false),
    ('GM-002', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-003', 'FIGHTING', true, true, false, true, true, 2, false),
    ('GM-004', 'SPORT', false, true, false, false, true, NULL, false),
    ('GM-005', 'SHOOTER', false, true, false, false, false, NULL, false),
    ('GM-006', 'PARTY', false, false, false, false, false, NULL, false),
    ('GM-007', 'RACING', true, true, false, false, true, 4, false),
    ('GM-008', 'FIGHTING', true, true, false, false, true, 6, false),
    ('GM-009', 'ACTION/RPG', true, true, false, false, false, 4, false),
    ('GM-010', 'PARTY', true, true, true, true, true, 4, false),
    ('GM-011', 'SPORT', true, true, false, false, true, 4, false),
    ('GM-012', 'SPORT', true, true, false, false, true, 2, false),
    ('GM-013', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-014', 'RACING', true, true, false, false, true, 2, false),
    ('GM-015', 'ACTION/ADVENTURE', true, true, false, false, false, 2, false),
    ('GM-016', 'SPORT', false, true, false, false, true, NULL, false),
    ('GM-017', 'RACING', true, true, true, false, true, 4, false),
    ('GM-018', 'SHOOTER', false, true, false, false, true, NULL, false),
    ('GM-019', 'ACTION/ADVENTURE', false, true, true, true, true, NULL, false),
    ('GM-020', 'SHOOTER', false, false, false, false, true, NULL, false),
    ('GM-021', 'RPG', false, false, false, false, true, NULL, false),
    ('GM-022', 'FIGHTING', true, true, false, false, true, 2, false),
    ('GM-023', 'ACTION/ADVENTURE', true, true, false, false, true, 2, false),
    ('GM-024', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-025', 'SHOOTER', true, true, false, false, true, 4, false),
    ('GM-026', 'SHOOTER/CO-OP', false, true, true, false, false, NULL, false),
    ('GM-027', 'RACING', false, true, false, false, true, NULL, false),
    ('GM-028', 'RACING', false, true, false, false, false, NULL, false),
    ('GM-029', 'FIGHTING', true, true, false, true, true, 2, false),
    ('GM-030', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-031', 'ACTION/RPG', false, true, true, false, true, NULL, false),
    ('GM-032', 'RACING', false, true, false, false, true, NULL, false),
    ('GM-033', 'PLATFORMER/PUZZLE', true, false, true, false, true, 2, false),
    ('GM-034', 'ACTION/RPG', false, false, false, false, true, NULL, false),
    ('GM-035', 'FIGHTING', false, false, false, false, false, NULL, false),
    ('GM-036', 'FIGHTING', true, true, false, false, true, 4, false),
    ('GM-037', 'SHOOTER', false, true, false, false, true, NULL, false),
    ('GM-038', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-039', 'PARTY', true, true, false, false, true, 4, false),
    ('GM-040', 'SURVIVAL HORROR', false, false, false, false, true, NULL, false),
    ('GM-041', 'SHOOTER', false, true, false, false, true, NULL, false),
    ('GM-042', 'ADVENTURE', true, true, false, false, true, 2, false),
    ('GM-043', 'PARTY', true, true, false, false, true, 4, false),
    ('GM-044', 'PLATFORMER', false, false, false, false, true, NULL, false),
    ('GM-045', 'ACTION/CO-OP', true, false, true, false, false, 2, false),
    ('GM-046', 'SPORT', true, true, false, true, true, 2, false),
    ('GM-047', 'ACTION', false, false, false, false, true, NULL, false),
    ('GM-048', 'ACTION/ADVENTURE', false, false, false, false, true, NULL, false),
    ('GM-049', 'RACING', false, true, false, false, true, NULL, false),
    ('GM-050', 'RACING', true, true, false, true, true, 4, false),
    ('GM-051', 'PLATFORMER', true, true, false, false, true, 2, false),
    ('GM-052', 'ACTION', true, true, false, false, true, 4, false),
    ('GM-053', 'FIGHTING', true, true, false, false, true, 2, false),
    ('GM-054', 'MUSIC', true, true, false, false, true, 4, false),
    ('GM-055', 'SPORT', true, true, false, false, true, 4, false),
    ('GM-056', 'SHOOTER', true, false, true, false, true, 2, false),
    ('GM-057', 'PARTY', true, true, false, false, true, 4, false),
    ('GM-058', 'SPORT', true, true, false, false, true, 4, false)
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
--   genre              : 58/58
--   single_player      : 49/58
--   online_multiplayer : 40/58
--   co_op              : 9/58
--   competitive        : 6/58
--   local_multiplayer  : 31/58  (3 sourced, rest judged)
--   max_local_players  : 31/58
--
-- local_multiplayer judgements (game_id: players on one screen):
--   GM-001: 2
--   GM-003: 2
--   GM-007: 4
--   GM-008: 6
--   GM-009: 4
--   GM-010: 4
--   GM-011: 4
--   GM-012: 2
--   GM-014: 2
--   GM-015: 2
--   GM-017: 4
--   GM-022: 2
--   GM-023: 2
--   GM-025: 4
--   GM-029: 2
--   GM-033: 2
--   GM-036: 4
--   GM-039: 4
--   GM-042: 2
--   GM-043: 4
--   GM-045: 2
--   GM-046: 2
--   GM-050: 4
--   GM-051: 2
--   GM-052: 4
--   GM-053: 2
--   GM-054: 4
--   GM-055: 4
--   GM-056: 2
--   GM-057: 4
--   GM-058: 4
--
-- Mode-flag corrections on top of the sourced P404 claims:
--   GM-005: online-only hero PvP; Wikidata's co-op mode claim is wrong
--   GM-019: GTA V has no couch play; story mode is single-player
-- Every Wikidata genre label was covered by the mapping (no unmapped labels).
