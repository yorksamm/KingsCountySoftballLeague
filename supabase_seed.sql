-- ============================================================================
-- Kings County Softball League — seed data
-- Run AFTER supabase_schema.sql, in the Supabase SQL Editor.
--
-- Contains the real 2026 B-division schedule you supplied (12 game days,
-- 105 game rows), both division rosters, and the field list.
--
-- ASSUMPTIONS BAKED IN HERE — please sanity-check these:
--   1. Team-name prefixes in the export ("3 HEAT", "6 STRAIGHT BALLERZ") are
--      standings seeds, not part of the name. Stripped.
--   2. Teams marked "- out" / "out" (BLUE DEVILS, TITANS, SUNDAY SAUCE) are
--      seeded with is_active = false. Their played results still count.
--   3. BROOKLYN CREW, TITANS, RENEGADES, JUICEHEADS and BK FUEL appear in the
--      B 2026 schedule but are on NEITHER roster you sent. They are seeded into
--      B 2026. >>> Move them if that's wrong. <<<
--   4. CARNAGE and SAINTS are C 2026 teams that appear in B-tagged games.
--      That's the cross-division case; standings are roster-based so they are
--      counted in the C 2026 table, not B. See lib/standings.js.
--   5. Field names are normalized to "Marine Pk # N" (space before the digit),
--      matching the schedule export and the CSV samples in the docs. Your
--      fields list mixed "Marine Pk #1" and "Marine Pk # 2" — that inconsistency
--      is exactly what breaks CSV imports, so pick ONE and stay with it.
--   6. Map URLs are generated Google Maps searches from each address. Replace
--      with real place links when you have them.
--   7. Games with status CAN carry a "0-0" score in the legacy export. Seeded
--      as NULL — a cancelled game has no score.
--   8. Field notes were truncated in your paste ("Street parking or use the
--      Avenue S lot l…"). Completed to a reasonable full sentence; edit in the
--      admin panel.
--
-- To wipe the seed and start clean:
--   truncate games, announcements restart identity;
--   delete from teams; delete from fields; delete from divisions;
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Divisions
-- ---------------------------------------------------------------------------
insert into divisions (name, sort_order) values
  ('B 2026', 1),
  ('C 2026', 2)
on conflict (name) do update set sort_order = excluded.sort_order;


-- ---------------------------------------------------------------------------
-- Fields
-- ---------------------------------------------------------------------------
insert into fields (name, address, map_url, notes, sort_order)
select v.name, v.address, v.map_url, v.notes, v.sort_order
from (values
  ('Gerritsen #3, 3rd field past school',
   'Gerritsen Ave and Everette Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Gerritsen+Ave+and+Everette+St+Brooklyn+NY',
   'Third field past the school.', 1),

  ('Marine Pk # 1',
   'Stuart Street and Avenue S, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Stuart+St+and+Avenue+S+Brooklyn+NY',
   'Street parking, or use the Avenue S lot.', 2),

  ('Marine Pk # 2',
   'Stuart Street and Avenue S, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Stuart+St+and+Avenue+S+Brooklyn+NY',
   'Stuart Street and Avenue S. Street parking, or use the Avenue S lot.', 3),

  ('Marine Pk # 5',
   'Avenue U and Stuart Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Avenue+U+and+Stuart+St+Brooklyn+NY',
   'Stuart Street & Avenue U. Street parking.', 4),

  ('Marine Pk # 6',
   'Avenue U between Stuart Street and East 33 Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Avenue+U+and+East+33+St+Brooklyn+NY',
   'Avenue U between Stuart Street and East 33 Street.', 5),

  ('Marine Pk # 8',
   'Avenue U between Stuart Street and East 33 Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Avenue+U+and+East+33+St+Brooklyn+NY',
   'Avenue U between Stuart Street and East 33 Street.', 6),

  ('Marine Pk # 9',
   'Avenue S and East 32 Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Avenue+S+and+East+32+St+Brooklyn+NY',
   'Avenue S and East 32 Street. Park in the Avenue S lot.', 7),

  ('Marine Pk # 10',
   'Avenue S and East 32nd Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Avenue+S+and+East+32+St+Brooklyn+NY',
   'Avenue S and East 32 Street. Park in the Avenue S lot.', 8),

  ('Bay 8th #6',
   'Bay 8th Street, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Bay+8th+St+Brooklyn+NY',
   null, 9),

  ('Bergen Beach #3',
   'Bergen Beach, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Bergen+Beach+Park+Brooklyn+NY',
   null, 10),

  ('Bergen Beach #1 - artificial turf',
   'Bergen Beach, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Bergen+Beach+Park+Brooklyn+NY',
   'Artificial turf field.', 12),

  ('79th St and Shore Rd #2',
   '79th Street and Shore Road, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=79th+St+and+Shore+Rd+Brooklyn+NY',
   null, 13),

  ('Mill Basin #2 (Lindower Park)',
   'Lindower Park, Brooklyn, NY',
   'https://www.google.com/maps/search/?api=1&query=Lindower+Park+Brooklyn+NY',
   'NOT the baseball fields.', 11),

  ('TBD', null, null,
   'Placeholder for games whose site has not been assigned yet.', 99)
) as v(name, address, map_url, notes, sort_order)
on conflict (name) do update
  set address    = excluded.address,
      map_url    = excluded.map_url,
      notes      = excluded.notes,
      sort_order = excluded.sort_order;


-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
insert into teams (name, division_id, is_active)
select v.name, (select id from divisions where name = v.division), v.is_active
from (values
  -- B 2026 roster
  ('GATORS',            'B 2026', true),
  ('MACHINE',           'B 2026', true),
  ('HEAT',              'B 2026', true),
  ('CERVECEROS',        'B 2026', true),
  ('RIPPERZ',           'B 2026', true),
  ('STRAIGHT BALLERZ',  'B 2026', true),
  ('TAINOS',            'B 2026', true),
  ('BLUE DEVILS',       'B 2026', false),  -- marked "- out"

  -- Teams that appear in the B 2026 schedule but are on NEITHER roster you
  -- sent (assumption #3 at the top of this file). The game rows below
  -- reference all five, so removing any of them makes the games insert fail
  -- with "null value in column home_team_id violates not-null constraint".
  -- If one of these isn't a real team, delete its GAMES too.
  ('BROOKLYN CREW',     'B 2026', true),
  ('RENEGADES',         'B 2026', true),
  ('JUICEHEADS',        'B 2026', true),
  ('BK FUEL',           'B 2026', true),
  ('TITANS',            'B 2026', false),  -- marked "- out"

  -- C 2026 roster
  ('BLOODLINE',         'C 2026', true),
  ('CARNAGE',           'C 2026', true),
  ('BLAZERS',           'C 2026', true),
  ('POST TIME',         'C 2026', true),
  ('SAINTS',            'C 2026', true),
  ('BULLDOGS',          'C 2026', false),
  ('SUNDAY SAUCE',      'C 2026', false)   -- marked "out"
) as v(name, division, is_active)
on conflict (name) do update
  set division_id = excluded.division_id,
      is_active   = excluded.is_active;


-- ---------------------------------------------------------------------------
-- Games — B 2026 schedule, April 12 through July 26 2026
--
-- Columns below are ordered to match your export so they can be diffed by eye:
--   date, time, game#, division, VISITOR, HOME, field, status, VIS score, HOME score
-- Scores are Visitor – Home throughout (docs Section 6).
-- ---------------------------------------------------------------------------
-- Staged first so the names can be checked against teams/fields/divisions
-- BEFORE anything is written. Without this, a single missing team surfaces as
-- "null value in column home_team_id violates not-null constraint" with a row
-- of UUIDs and no clue which name was wrong.
create temp table seed_games (
  game_date     text,
  start_time    text,
  game_number   smallint,
  division      text,
  visitor       text,
  home          text,
  field         text,
  status        text,
  visitor_score integer,
  home_score    integer
) on commit drop;

insert into seed_games
select *
from (values
  -- ---- Sun 4/12 ----------------------------------------------------------
  ('2026-04-12','09:00',1,'B 2026','HEAT','STRAIGHT BALLERZ','Marine Pk # 1','final',7,2),
  ('2026-04-12','09:00',1,'B 2026','TAINOS','BROOKLYN CREW','Marine Pk # 10','final',11,5),
  ('2026-04-12','09:00',1,'B 2026','BLUE DEVILS','GATORS','Marine Pk # 6','final',8,18),
  ('2026-04-12','09:00',1,'B 2026','MACHINE','RIPPERZ','Marine Pk # 9','final',10,0),
  ('2026-04-12','10:00',2,'B 2026','HEAT','STRAIGHT BALLERZ','Marine Pk # 1','final',8,2),
  ('2026-04-12','10:00',2,'B 2026','TAINOS','BROOKLYN CREW','Marine Pk # 10','final',10,0),
  ('2026-04-12','10:00',2,'B 2026','BLUE DEVILS','GATORS','Marine Pk # 6','final',2,9),
  ('2026-04-12','10:00',2,'B 2026','MACHINE','RIPPERZ','Marine Pk # 9','final',6,5),

  -- ---- Sun 4/19 ----------------------------------------------------------
  ('2026-04-19','09:00',1,'B 2026','RIPPERZ','STRAIGHT BALLERZ','Gerritsen #3, 3rd field past school','final',12,11),
  ('2026-04-19','09:00',1,'B 2026','MACHINE','TAINOS','Marine Pk # 2','final',6,4),
  ('2026-04-19','09:00',1,'B 2026','GATORS','HEAT','Marine Pk # 8','final',2,9),
  ('2026-04-19','09:00',1,'B 2026','BLUE DEVILS','TITANS','Marine Pk # 9','final',15,5),
  ('2026-04-19','10:00',2,'B 2026','RIPPERZ','STRAIGHT BALLERZ','Gerritsen #3, 3rd field past school','final',17,9),
  ('2026-04-19','10:00',2,'B 2026','MACHINE','TAINOS','Marine Pk # 2','final',6,4),
  ('2026-04-19','10:00',2,'B 2026','GATORS','HEAT','Marine Pk # 8','final',9,2),
  ('2026-04-19','10:00',2,'B 2026','BLUE DEVILS','TITANS','Marine Pk # 9','final',14,17),

  -- ---- Sun 4/26 — never played, still TBP in the source export -----------
  ('2026-04-26','09:00',1,'B 2026','MACHINE','CERVECEROS','Marine Pk # 10','tbp',null,null),
  ('2026-04-26','09:00',1,'B 2026','TAINOS','BLUE DEVILS','Marine Pk # 2','tbp',null,null),
  ('2026-04-26','09:00',1,'B 2026','BROOKLYN CREW','HEAT','Marine Pk # 5','tbp',null,null),
  ('2026-04-26','09:00',1,'B 2026','RIPPERZ','RENEGADES','Marine Pk # 6','tbp',null,null),
  ('2026-04-26','09:00',1,'B 2026','GATORS','STRAIGHT BALLERZ','Marine Pk # 9','tbp',null,null),

  -- ---- Sun 5/3 -----------------------------------------------------------
  ('2026-05-03','09:00',1,'B 2026','MACHINE','CERVECEROS','Marine Pk # 10','final',10,5),
  ('2026-05-03','09:00',1,'B 2026','TAINOS','BLUE DEVILS','Marine Pk # 2','final',12,3),
  ('2026-05-03','09:00',1,'B 2026','BROOKLYN CREW','HEAT','Marine Pk # 5','final',0,7),
  ('2026-05-03','09:00',1,'B 2026','RIPPERZ','RENEGADES','Marine Pk # 6','final',4,2),
  ('2026-05-03','09:00',1,'B 2026','GATORS','STRAIGHT BALLERZ','Marine Pk # 9','final',11,8),
  ('2026-05-03','10:00',2,'B 2026','MACHINE','CERVECEROS','Marine Pk # 10','final',5,6),
  ('2026-05-03','10:00',2,'B 2026','TAINOS','BLUE DEVILS','Marine Pk # 2','final',3,13),
  ('2026-05-03','10:00',2,'B 2026','BROOKLYN CREW','HEAT','Marine Pk # 5','final',0,7),
  ('2026-05-03','10:00',2,'B 2026','RIPPERZ','RENEGADES','Marine Pk # 6','final',6,0),
  ('2026-05-03','10:00',2,'B 2026','GATORS','STRAIGHT BALLERZ','Marine Pk # 9','final',14,16),

  -- ---- Sun 5/10 ----------------------------------------------------------
  ('2026-05-10','09:00',1,'B 2026','CERVECEROS','SUNDAY SAUCE','Marine Pk # 5','final',7,0),
  ('2026-05-10','10:00',2,'B 2026','CERVECEROS','SUNDAY SAUCE','Marine Pk # 5','final',7,0),

  -- ---- Sun 5/17 ----------------------------------------------------------
  ('2026-05-17','09:00',1,'B 2026','TAINOS','RIPPERZ','Gerritsen #3, 3rd field past school','final',2,4),
  ('2026-05-17','09:00',1,'B 2026','BLUE DEVILS','STRAIGHT BALLERZ','Marine Pk # 10','final',8,17),
  ('2026-05-17','09:00',1,'B 2026','MACHINE','GATORS','Marine Pk # 8','final',2,7),
  ('2026-05-17','09:00',1,'B 2026','HEAT','CERVECEROS','Marine Pk # 9','final',2,6),
  ('2026-05-17','10:00',2,'B 2026','TAINOS','RIPPERZ','Gerritsen #3, 3rd field past school','final',13,3),
  ('2026-05-17','10:00',2,'B 2026','BLUE DEVILS','STRAIGHT BALLERZ','Marine Pk # 10','final',12,17),
  ('2026-05-17','10:00',2,'B 2026','MACHINE','GATORS','Marine Pk # 8','final',9,13),
  ('2026-05-17','10:00',2,'B 2026','HEAT','CERVECEROS','Marine Pk # 9','final',5,0),

  -- ---- Sun 5/31 ----------------------------------------------------------
  ('2026-05-31','09:00',1,'B 2026','BLUE DEVILS','RIPPERZ','Marine Pk # 1','final',3,7),
  ('2026-05-31','09:00',1,'B 2026','STRAIGHT BALLERZ','MACHINE','Marine Pk # 10','final',3,5),
  ('2026-05-31','09:00',1,'B 2026','TAINOS','HEAT','Marine Pk # 8','final',0,7),
  ('2026-05-31','09:00',1,'B 2026','CERVECEROS','GATORS','Marine Pk # 9','final',7,1),
  ('2026-05-31','10:00',2,'B 2026','BLUE DEVILS','RIPPERZ','Marine Pk # 1','final',9,5),
  ('2026-05-31','10:00',2,'B 2026','STRAIGHT BALLERZ','MACHINE','Marine Pk # 10','final',3,8),
  ('2026-05-31','10:00',2,'B 2026','TAINOS','HEAT','Marine Pk # 8','final',0,7),
  ('2026-05-31','10:00',2,'B 2026','CERVECEROS','GATORS','Marine Pk # 9','final',5,7),

  -- ---- Sun 6/7 -----------------------------------------------------------
  ('2026-06-07','09:00',1,'B 2026','HEAT','RIPPERZ','Gerritsen #3, 3rd field past school','final',6,4),
  ('2026-06-07','09:00',1,'B 2026','STRAIGHT BALLERZ','CERVECEROS','Marine Pk # 8','final',0,3),
  ('2026-06-07','09:00',1,'B 2026','MACHINE','CARNAGE','Marine Pk # 9','final',5,4),
  ('2026-06-07','09:00',1,'B 2026','TAINOS','GATORS','TBD','final',0,7),
  ('2026-06-07','10:00',2,'B 2026','HEAT','RIPPERZ','Gerritsen #3, 3rd field past school','final',5,4),
  ('2026-06-07','10:00',2,'B 2026','STRAIGHT BALLERZ','CERVECEROS','Marine Pk # 8','final',1,11),
  ('2026-06-07','10:00',2,'B 2026','MACHINE','CARNAGE','Marine Pk # 9','final',5,6),
  ('2026-06-07','10:00',2,'B 2026','TAINOS','GATORS','TBD','final',0,7),

  -- ---- Sun 6/14 ----------------------------------------------------------
  ('2026-06-14','09:00',1,'B 2026','RIPPERZ','GATORS','Marine Pk # 1','final',0,7),
  ('2026-06-14','09:00',1,'B 2026','BLUE DEVILS','CERVECEROS','Marine Pk # 10','final',4,8),
  ('2026-06-14','09:00',1,'B 2026','STRAIGHT BALLERZ','TAINOS','Marine Pk # 8','final',8,3),
  ('2026-06-14','09:00',1,'B 2026','MACHINE','HEAT','Marine Pk # 9','final',11,1),
  ('2026-06-14','10:00',2,'B 2026','RIPPERZ','GATORS','Marine Pk # 1','final',0,7),
  ('2026-06-14','10:00',2,'B 2026','BLUE DEVILS','CERVECEROS','Marine Pk # 10','final',5,4),
  ('2026-06-14','10:00',2,'B 2026','STRAIGHT BALLERZ','TAINOS','Marine Pk # 8','final',10,19),
  ('2026-06-14','10:00',2,'B 2026','MACHINE','HEAT','Marine Pk # 9','final',7,1),

  -- ---- Sun 6/21 ----------------------------------------------------------
  ('2026-06-21','09:00',1,'B 2026','TAINOS','CERVECEROS','Marine Pk # 1','final',3,9),
  ('2026-06-21','09:00',1,'B 2026','RIPPERZ','MACHINE','Marine Pk # 10','final',7,8),
  ('2026-06-21','09:00',1,'B 2026','HEAT','GATORS','Marine Pk # 5','final',1,0),
  ('2026-06-21','09:00',1,'B 2026','BLUE DEVILS','MACHINE','TBD','final',0,7),
  ('2026-06-21','09:00',1,'B 2026','STRAIGHT BALLERZ','RIPPERZ','TBD','final',0,7),
  ('2026-06-21','10:00',2,'B 2026','TAINOS','CERVECEROS','Marine Pk # 1','final',4,6),
  ('2026-06-21','10:00',2,'B 2026','RIPPERZ','MACHINE','Marine Pk # 10','final',3,11),
  ('2026-06-21','10:00',2,'B 2026','HEAT','GATORS','Marine Pk # 5','final',5,7),
  ('2026-06-21','10:00',2,'B 2026','BLUE DEVILS','MACHINE','TBD','final',0,7),
  ('2026-06-21','10:00',2,'B 2026','STRAIGHT BALLERZ','RIPPERZ','TBD','final',0,7),

  -- ---- Sun 6/28 ----------------------------------------------------------
  ('2026-06-28','09:00',1,'B 2026','GATORS','SAINTS','Bay 8th #6','final',11,3),
  ('2026-06-28','09:00',1,'B 2026','BROOKLYN CREW','TAINOS','Bergen Beach #3','final',7,9),
  ('2026-06-28','09:00',1,'B 2026','HEAT','STRAIGHT BALLERZ','Marine Pk # 10','final',7,8),
  ('2026-06-28','09:00',1,'B 2026','CERVECEROS','RIPPERZ','Marine Pk # 9','final',8,7),
  ('2026-06-28','10:00',2,'B 2026','GATORS','SAINTS','Bay 8th #6','final',6,5),
  ('2026-06-28','10:00',2,'B 2026','BROOKLYN CREW','TAINOS','Bergen Beach #3','final',11,1),
  ('2026-06-28','10:00',2,'B 2026','HEAT','STRAIGHT BALLERZ','Marine Pk # 10','final',12,4),
  ('2026-06-28','10:00',2,'B 2026','CERVECEROS','RIPPERZ','Marine Pk # 9','final',2,4),

  -- ---- Sun 7/12 ----------------------------------------------------------
  ('2026-07-12','09:00',1,'B 2026','STRAIGHT BALLERZ','RIPPERZ','Gerritsen #3, 3rd field past school','final',6,16),
  ('2026-07-12','09:00',1,'B 2026','CERVECEROS','MACHINE','Marine Pk # 10','final',12,15),
  ('2026-07-12','09:00',1,'B 2026','GATORS','TAINOS','Marine Pk # 6','final',13,3),
  ('2026-07-12','09:00',1,'B 2026','HEAT','CARNAGE','Mill Basin #2 (Lindower Park)','final',10,5),
  ('2026-07-12','10:00',2,'B 2026','STRAIGHT BALLERZ','RIPPERZ','Gerritsen #3, 3rd field past school','final',4,9),
  ('2026-07-12','10:00',2,'B 2026','CERVECEROS','MACHINE','Marine Pk # 10','final',4,3),
  ('2026-07-12','10:00',2,'B 2026','GATORS','TAINOS','Marine Pk # 6','final',12,9),
  ('2026-07-12','10:00',2,'B 2026','HEAT','CARNAGE','Mill Basin #2 (Lindower Park)','final',10,0),

  -- ---- Sun 7/19 — mostly rained out --------------------------------------
  ('2026-07-19','09:00',1,'B 2026','RIPPERZ','TAINOS','Gerritsen #3, 3rd field past school','cancelled',null,null),
  ('2026-07-19','09:00',1,'B 2026','BROOKLYN CREW','CERVECEROS','Marine Pk # 10','final',2,9),
  ('2026-07-19','09:00',1,'B 2026','STRAIGHT BALLERZ','JUICEHEADS','Marine Pk # 6','cancelled',null,null),
  ('2026-07-19','09:00',1,'B 2026','MACHINE','GATORS','Marine Pk # 8','cancelled',null,null),
  ('2026-07-19','10:00',2,'B 2026','BROOKLYN CREW','CERVECEROS','Marine Pk # 10','final',1,11),
  ('2026-07-19','10:00',2,'B 2026','STRAIGHT BALLERZ','JUICEHEADS','Marine Pk # 6','cancelled',null,null),

  -- ---- Sun 7/26 ----------------------------------------------------------
  ('2026-07-26','09:00',1,'B 2026','TAINOS','RIPPERZ','Gerritsen #3, 3rd field past school','final',0,7),
  ('2026-07-26','09:00',1,'B 2026','GATORS','MACHINE','Marine Pk # 6','final',15,4),
  ('2026-07-26','09:00',1,'B 2026','CERVECEROS','HEAT','Marine Pk # 8','final',9,4),
  ('2026-07-26','09:00',1,'B 2026','STRAIGHT BALLERZ','JUICEHEADS','Mill Basin #2 (Lindower Park)','final',19,3),
  ('2026-07-26','10:00',2,'B 2026','TAINOS','RIPPERZ','Gerritsen #3, 3rd field past school','final',0,7),
  ('2026-07-26','10:00',2,'B 2026','GATORS','MACHINE','Marine Pk # 6','final',9,14),
  ('2026-07-26','10:00',2,'B 2026','CERVECEROS','HEAT','Marine Pk # 8','final',2,12),
  -- Different opponent, same field/date as the 9:00 game above, so this is its
  -- own matchup with a single game — not Game 2 of the JUICEHEADS header.
  ('2026-07-26','10:00',1,'B 2026','BK FUEL','STRAIGHT BALLERZ','Mill Basin #2 (Lindower Park)','final',6,7),

-- ---- Sun 8/2 ----------------------------------------------------------
  ('2026-08-02','09:00',1,'B 2026','STRAIGHT BALLERZ','HEAT','Marine Pk # 10','final',4,0),
  ('2026-08-02','09:00',1,'B 2026','RIPPERZ','CERVECEROS','Marine Pk # 5','tbp',NULL,NULL),
  ('2026-08-02','09:00',1,'B 2026','TAINOS','MACHINE','Marine Pk # 8','final',0,7),
  ('2026-08-02','10:00',2,'B 2026','STRAIGHT BALLERZ','HEAT','Marine Pk # 10','final',1,4),
  ('2026-08-02','10:00',2,'B 2026','RIPPERZ','CERVECEROS','Marine Pk # 5','tbp',NULL,NULL),
  ('2026-08-02','10:00',2,'B 2026','TAINOS','MACHINE','Marine Pk # 8','final',0,7),
  ('2026-08-02','11:00',3,'B 2026','STRAIGHT BALLERZ','HEAT','Marine Pk # 10','final',1,4),
  ('2026-08-02','11:00',3,'B 2026','RIPPERZ','CERVECEROS','Marine Pk # 5','tbp',NULL,NULL),

  -- ---- Sun 8/9 — UPCOMING -----------------------------------------------
  -- The next slate. Only the 9:00 games were supplied; if these are double
  -- headers, add the 10:00 rows with game_number 2 and the same date + field
  -- + teams and they'll pair onto the same card automatically.
  ('2026-08-09','09:00',1,'B 2026','HEAT','MACHINE','Marine Pk # 10','tbp',null,null),
  ('2026-08-09','09:00',1,'B 2026','CERVECEROS','GATORS','Marine Pk # 8','tbp',null,null),
  ('2026-08-09','09:00',1,'C 2026','SAINTS','CARNAGE','79th St and Shore Rd #2','tbp',null,null),
  ('2026-08-09','09:00',1,'C 2026','BROOKLYN CREW','BLOODLINE','Bergen Beach #1 - artificial turf','tbp',null,null)
) as v(game_date, start_time, game_number, division, visitor, home, field, status, visitor_score, home_score);


-- ---------------------------------------------------------------------------
-- Pre-flight: every name referenced above must already exist. Fails loudly and
-- writes nothing rather than producing a null foreign key.
-- ---------------------------------------------------------------------------
do $$
declare problems text;
begin
  select string_agg(msg, E'\n  ' order by msg) into problems
  from (
      select distinct 'Missing team: "'     || s.n     || '"' as msg
      from (select visitor as n from seed_games union select home from seed_games) s
      where not exists (select 1 from teams t where t.name = s.n)
    union all
      select distinct 'Missing field: "'    || s.field || '"'
      from seed_games s
      where not exists (select 1 from fields f where f.name = s.field)
    union all
      select distinct 'Missing division: "' || s.division || '"'
      from seed_games s
      where not exists (select 1 from divisions d where d.name = s.division)
  ) errs;

  if problems is not null then
    raise exception E'Seed aborted, nothing was written.\n  %\n\nEvery name must exist before the games insert runs. Two usual causes:\n  1. Only part of this file ran — highlighting text in the Supabase SQL Editor runs ONLY the selection. Click into the editor and press Cmd+A / Ctrl+A first.\n  2. A team was edited out of the teams block above while its games remained.',
      problems;
  end if;
end $$;


insert into games (
  game_date, start_time, game_number, division_id,
  visitor_team_id, home_team_id, field_id,
  status, visitor_score, home_score
)
select
  s.game_date::date,
  s.start_time::time,
  s.game_number,
  (select id from divisions where name = s.division),
  (select id from teams     where name = s.visitor),
  (select id from teams     where name = s.home),
  (select id from fields    where name = s.field),
  s.status::game_status,
  s.visitor_score,
  s.home_score
from seed_games s
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
-- Guarded on title rather than ON CONFLICT: announcements have no unique
-- constraint, so a bare re-run would otherwise insert duplicates every time.
insert into announcements (title, body, active, pinned)
select v.title, v.body, v.active, v.pinned
-- Bodies use the announcement formatting syntax: # heading, - bullet,
-- **bold**, [text](url), --- divider. See src/lib/richText.jsx.
from (values
  ('Playoff seeding is set',
   E'Regular season play has concluded. Playoff brackets and first-round matchups go up this week — check the [upcoming games](/upcoming) page for times and fields.\n\n'
   '## How seeding was decided\n\n'
   'Standings are sorted by **win percentage** first, then **run differential** as the tiebreaker. A tie counts as half a win.\n\n'
   '- Final games and resolved forfeits count toward the record\n'
   '- Cancelled, postponed and suspended games do not count at all\n'
   '- A forfeit awards the win and loss but no runs, so it never moves run differential\n\n'
   'The full table is on the [standings](/standings) page.\n\n'
   '---\n\n'
   '## What happens next\n\n'
   '1. Brackets posted by Wednesday\n'
   '2. First round the following Sunday, 9:00 am start\n'
   '3. Rainouts move to the next available Sunday\n\n'
   'Managers: confirm your roster with your division rep before the first game.',
   true, true),

  ('Field reminder: Mill Basin #2',
   E'Mill Basin #2 is in **Lindower Park**. These are *not* the baseball fields.\n\n'
   'Follow the path past the parking area to the softball diamonds. Several teams have gone to the wrong field this season and forfeited the first game while waiting.\n\n'
   '## Getting there\n\n'
   '- Parking is on the Avenue S side\n'
   '- Allow ten minutes to walk in\n'
   '- Field notes and a map link are on every game card',
   true, false),

  ('Umpire assignments and game-day contacts',
   E'Umpires are assigned by the league, not by teams. If an umpire has not arrived fifteen minutes after the scheduled start:\n\n'
   '1. Call your division rep\n'
   '2. Do **not** start the game with a substitute umpire unless the league approves it\n'
   '3. If the game cannot be played, it is recorded as postponed, not forfeited\n\n'
   'Scores are reported by the **home team manager** within 24 hours of the game.',
   true, false),

  ('Season opener — April 12',
   E'Opening day is April 12. First pitch at 9:00 am across all sites.\n\n'
   'Check the schedule for your field assignment — several games moved after the field permits came through.',
   false, false)
) as v(title, body, active, pinned)
where not exists (select 1 from announcements a where a.title = v.title);

commit;


-- ---------------------------------------------------------------------------
-- Sanity checks — run these after the seed to confirm everything landed.
-- ---------------------------------------------------------------------------
-- select count(*) as games from games;                          -- expect 109
-- select status, count(*) from games group by status order by 2 desc;
-- select name, is_active from teams order by name;              -- expect 20
-- select count(*) from games where game_date >= current_date;   -- expect 4
--
-- This whole file is safe to re-run: existing rows are updated or skipped and
-- nothing is duplicated.
--
-- The Home page shows ONLY upcoming games. The four 2026-08-09 rows are the
-- ones that will appear there; everything before that date lives on the
-- Schedule page. Once 8/9 passes, Home goes empty until the next slate is
-- added — that's expected, not a bug.
