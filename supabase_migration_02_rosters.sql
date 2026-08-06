-- ============================================================================
-- MIGRATION 02 — team rosters (players)
--
-- Run this ONCE in the Supabase SQL Editor if your database already exists.
-- Setting up a fresh project? Skip it — supabase_schema.sql already includes
-- everything here.
--
-- Adds one table. Nothing existing is altered, so it is safe to run on a live
-- database mid-season.
-- ============================================================================

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),

  -- TEXT, not integer: "00" is a real and distinct softball jersey number, and
  -- an integer column would collapse it to 0.
  jersey_number text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists players_team_idx on players (team_id);

-- One jersey number per team. Partial, so several players may have no number
-- yet without colliding.
create unique index if not exists players_team_jersey_uidx
  on players (team_id, jersey_number)
  where jersey_number is not null;

-- Blocks the same name twice on one team, which is what a re-imported roster
-- CSV looks like. Genuine namesakes need a suffix ("Mike Smith Jr").
create unique index if not exists players_team_name_uidx
  on players (team_id, lower(trim(name)));

drop trigger if exists players_updated_at on players;
create trigger players_updated_at before update on players
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- Row Level Security — same shape as every other table: world-readable,
-- admin-writable. Rosters are public information on a league site.
-- ---------------------------------------------------------------------------
alter table players enable row level security;

drop policy if exists players_public_read on players;
drop policy if exists players_admin_all   on players;

create policy players_public_read on players
  for select to anon, authenticated using (true);

create policy players_admin_all on players
  for all to authenticated using (true) with check (true);


-- ---------------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------------
-- select tablename, rowsecurity from pg_tables where tablename = 'players';
-- select policyname, cmd, roles from pg_policies where tablename = 'players';
--
-- Rosters start empty. Add players under Admin -> Rosters, or import a CSV:
--   team,name,jersey_number
--   GATORS,Mike Torres,12
--
-- Deleting a team deletes its players (ON DELETE CASCADE). Teams with games
-- can't be deleted anyway, so this only affects teams that never played.
