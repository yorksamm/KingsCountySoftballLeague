-- ============================================================================
-- MIGRATION 01 — allow tripleheaders, and move duplicate protection to the
--                time slot instead of the game counter.
--
-- Run this ONCE in the Supabase SQL Editor if you created your database from
-- the original supabase_schema.sql. If you are setting up a fresh project,
-- skip this file — the current supabase_schema.sql already includes it.
--
-- WHY
-- Docs v3.0 Section 4 caps a matchup at two games and says a third row must be
-- rejected. Real KCSL data has tripleheaders (9:00 / 10:00 / 11:00), so that
-- rule is wrong. Hitting it looks like:
--
--   ERROR: 23514: new row for relation "games" violates check constraint
--          "games_game_number_check"
--
-- Losing the cap also loses the duplicate protection it was doing, so step 3
-- replaces it with a better guard.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — unblock the import. Safe, instant, no data touched.
-- ---------------------------------------------------------------------------
alter table games drop constraint if exists games_game_number_check;

alter table games add constraint games_game_number_check
  check (game_number between 1 and 9);

-- game_number is now just a display/ordering label with a loose sanity bound.
-- It is NOT the duplicate rule. Step 3 below is the duplicate rule.


-- ---------------------------------------------------------------------------
-- STEP 2 — CHECK BEFORE STEP 3. Run this on its own and read the output.
--
-- It lists any matchups that already have two games sharing one time slot.
-- Those are almost certainly accidental double-entries. Step 3 will FAIL until
-- they are cleaned up.
--
-- Zero rows returned = you are clear to run step 3.
-- ---------------------------------------------------------------------------
select
  g.game_date,
  f.name  as field,
  v.name || ' vs ' || h.name as matchup,
  g.start_time,
  count(*)                   as rows_at_this_time,
  array_agg(g.id)            as game_ids,
  array_agg(g.game_number)   as game_numbers,
  array_agg(g.status::text)  as statuses
from games g
join fields f on f.id = g.field_id
join teams  v on v.id = g.visitor_team_id
join teams  h on h.id = g.home_team_id
group by g.game_date, g.field_id, f.name, g.team_lo, g.team_hi, v.name, h.name, g.start_time
having count(*) > 1
order by g.game_date, g.start_time;

-- To remove one of a duplicated pair, keep the row that has the score:
--   delete from games where id = '<the game_id you do not want>';


-- ---------------------------------------------------------------------------
-- STEP 3 — the replacement duplicate guard.
--
-- Two games of the same matchup can no longer share a time slot. This catches
-- an accidentally re-imported CSV (same date, field, teams AND times) no matter
-- what game_number the importer assigned — which the old two-game cap only did
-- by accident.
--
-- Run this only after step 2 returns zero rows.
-- ---------------------------------------------------------------------------
create unique index if not exists games_matchup_slot_uidx
  on games (game_date, field_id, team_lo, team_hi, start_time) nulls not distinct;


-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- Both indexes present?
--   select indexname from pg_indexes
--   where tablename = 'games' and indexname like 'games_matchup%';
--   -- expect games_matchup_round_uidx and games_matchup_slot_uidx
--
-- Any tripleheaders now stored?
--   select game_date, max(game_number) as games_in_matchup
--   from games group by game_date, field_id, team_lo, team_hi
--   having max(game_number) > 2 order by game_date;
