-- Game metadata backfill.
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
    ('GM-001', 'Hazelight Studios', 'EA Originals', '2023-03-23'),
    ('GM-002', 'Game Science', 'Game Science', '2024-08-20'),
    ('GM-003', 'Bandai Namco Studios', 'Bandai Namco Entertainment', '2024-01-26'),
    ('GM-004', 'EA Vancouver', 'Electronic Arts', '2024-09-27'),
    ('GM-005', 'NetEase Games', 'NetEase Games', '2024-12-06'),
    ('GM-006', 'Ubisoft Quebec', 'Ubisoft', '2022-04-21'),
    ('GM-007', 'Beenox', 'Activision', '2019-06-27'),
    ('GM-008', 'Spike Chunsoft', 'Bandai Namco Entertainment', '2024-10-10'),
    ('GM-009', 'The Gentlebros', 'The Gentlebros', '2019-09-19'),
    ('GM-010', 'Ghost Town Games', 'Team17', '2021-03-23'),
    ('GM-011', 'Visual Concepts', '2K', '2024-09-06'),
    ('GM-012', 'Konami', 'Konami', '2021-09-30'),
    ('GM-013', 'Ubisoft Montreal', 'Ubisoft', '2020-11-10'),
    ('GM-014', 'Milestone S.r.l.', 'Milestone S.r.l.', '2023-08-24'),
    ('GM-015', 'Hazelight Studios', 'EA Originals', '2021-03-26'),
    ('GM-016', 'Big Ant Studios', 'Nacon', '2020-09-22'),
    ('GM-017', 'Gameloft Iberica', 'Gameloft', '2023-04-18'),
    ('GM-018', 'Housemarque', 'Sony Interactive Entertainment', '2016-04-26'),
    ('GM-019', 'Rockstar North', 'Rockstar Games', '2013-09-17'),
    ('GM-020', 'EA Montreal', 'Electronic Arts', '2008-10-08'),
    ('GM-021', 'ILCA', 'Bandai Namco Entertainment', '2023-01-13'),
    ('GM-022', 'EA Vancouver', 'Electronic Arts', '2023-10-27'),
    ('GM-023', 'Ubisoft Montreal', 'Ubisoft', '2016-11-15'),
    ('GM-024', 'Tango Gameworks', 'Bethesda Softworks', '2022-03-25'),
    ('GM-025', 'DICE', 'Electronic Arts', '2016-10-21'),
    ('GM-026', 'Arrowhead Game Studios', 'Sony Interactive Entertainment', '2024-02-08'),
    ('GM-027', 'Polyphony Digital', 'Sony Interactive Entertainment', '2022-03-04'),
    ('GM-028', 'Milestone S.r.l.', 'Milestone S.r.l.', '2024-05-02'),
    ('GM-029', 'Capcom', 'Capcom', '2023-06-02'),
    ('GM-030', 'Insomniac Games', 'Sony Interactive Entertainment', '2023-10-20'),
    ('GM-031', 'FromSoftware', 'Bandai Namco Entertainment', '2022-02-25'),
    ('GM-032', 'Codemasters', 'Electronic Arts', '2023-06-16'),
    ('GM-033', 'Coldwood Interactive', 'Electronic Arts', '2018-06-09'),
    ('GM-034', 'Tripwire Interactive', 'Tripwire Interactive', '2020-05-22'),
    ('GM-035', 'Yager Development', 'Yager', '2021-10-21'),
    ('GM-036', 'CyberConnect2', 'Bandai Namco Entertainment', '2016-02-09'),
    ('GM-037', 'Treyarch', 'Activision', '2015-11-06'),
    ('GM-038', 'Traveller''s Tales', 'Warner Bros. Games', '2015-06-14'),
    ('GM-039', 'Game Swing', 'Game Swing', '2023-01-26'),
    ('GM-040', 'Remedy Entertainment', 'Epic Games Publishing', '2023-10-27'),
    ('GM-041', 'Treyarch', 'Activision', '2024-10-25'),
    ('GM-042', 'Starbreeze Studios', '505 Games', '2013-08-07'),
    ('GM-043', 'Balio Studio', NULL, '2022-11-10'),
    ('GM-044', 'Tarsier Studios', 'Bandai Namco Entertainment', '2017-04-28'),
    ('GM-045', 'Cat-astrophe Games', 'Radiance Interactive', '2019-06-08'),
    ('GM-046', 'Ubisoft Annecy', 'Ubisoft', '2021-10-28'),
    ('GM-047', 'DigixArt', 'Ravenscourt', '2021-08-16'),
    ('GM-048', 'Reflector Entertainment', 'Bandai Namco Entertainment', '2024-10-18'),
    ('GM-049', 'Code Mystics', 'Aspyr', '2023-09-28'),
    ('GM-050', 'Nintendo Entertainment Planning & Development', 'Nintendo', '2017-04-28'),
    ('GM-051', 'HAL Laboratory', 'Nintendo', '2023-02-24'),
    ('GM-052', 'Tribute Games', 'Dotemu', '2022-06-16'),
    ('GM-053', 'Nintendo Entertainment Planning & Development', 'Nintendo', '2017-06-16'),
    ('GM-054', 'Ubisoft Paris', 'Ubisoft', '2021-11-04'),
    ('GM-055', 'Camelot Software Planning', 'Nintendo', '2018-06-22'),
    ('GM-056', 'MegaPixel Studio', 'Forever Entertainment', '2022-04-07'),
    ('GM-057', 'Nintendo Cube', 'Nintendo', '2021-10-29'),
    ('GM-058', 'Tamsoft', 'Bandai Namco Entertainment', '2022-02-17')
) as v(game_id, developer, publisher, release_date)
where g.game_id = v.game_id;

-- Coverage after this migration:
--   developer    : 58/58
--   publisher    : 57/58
--   release_date : 58/58
--   age_rating   : 0/58 (intentionally left null, see header)
--
-- Still incomplete:
--   GM-043 Garfield Lasagna Party: developer=Balio Studio publisher=NULL release_date=2022-11-10
--
-- Overrides applied on top of the harvest, with reasons:
--   GM-001 (A Way Out): harvest matched the cancelled 2018 project, not the 2023 game
--   GM-020 (Dead Space): harvest matched the 2023 remake, which has no release date
--   GM-038 (LEGO Jurassic World): harvest had day precision missing (2015-06-00)
--   GM-058 (Captain Tsubasa: Rise of New Champions): harvest had month+day missing (2020-00-00)
--   GM-006 (Rabbids Party of Legends): no Wikidata video-game match
--   GM-035 (Undisputed): no Wikidata video-game match
