-- ============================================================================
-- Kings County Softball League — schema + Row Level Security
-- Docs v3.0, Sections 4, 5, 6, 7, 8
--
-- Run ONCE in the Supabase SQL Editor (SQL Editor > New query > paste > Run).
-- Safe to re-run: everything is idempotent (drop-if-exists / if-not-exists).
--
-- Admin model chosen for this deployment: ANY AUTHENTICATED USER IS AN ADMIN
-- (docs Section 8.1, option B). This is only safe because there is no public
-- sign-up — every account is created by hand in Authentication > Users.
-- If you ever enable self-signup or add non-admin logins, you MUST switch to
-- an allow-list table. See the note at the bottom of this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()


-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
-- Status values exactly as specified in docs Section 5 (CSV) / Section 3 (key).
--   tbp           TBP    To Be Played
--   final         F      Final (a TIE is simply final with equal scores)
--   not_reported  N/R    Played, score not entered yet
--   cancelled     CAN    Will not be played
--   postponed     PPD    Rescheduled, new date TBA
--   suspended     SPD    Stopped, to be resumed
--   forfeit       FFT    Forfeit pending league review — counts toward nothing
--   forfeit_loss  FFT-L  HOME team forfeited -> home L, visitor W
--   forfeit_win   FFT-W  VISITOR team forfeited -> home W, visitor L
--
-- NOTE ON NAMING: forfeit_loss / forfeit_win are named relative to the HOME
-- team, per docs Section 6. They are counter-intuitive (forfeit_win produces a
-- LOSS for the visiting team). The admin UI never shows the raw value — it
-- shows "Forfeit — home forfeited" / "Forfeit — visitor forfeited".
do $$
begin
  if not exists (select 1 from pg_type where typname = 'game_status') then
    create type game_status as enum (
      'tbp',
      'final',
      'not_reported',
      'cancelled',
      'postponed',
      'suspended',
      'forfeit',
      'forfeit_loss',
      'forfeit_win'
    );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- Divisions ------------------------------------------------------------------
create table if not exists divisions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
comment on table divisions is
  'Season is encoded in the division name (e.g. "B 2026"). There is no separate season table in v1.';

-- Teams ----------------------------------------------------------------------
create table if not exists teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  division_id   uuid not null references divisions(id) on delete restrict,
  contact_name  text,
  contact_email text,
  -- NOT IN DOCS v3.0. Added because the real league data marks withdrawn teams
  -- "- out" mid-season. Inactive teams keep every game they already played and
  -- still appear in standings; they are just hidden from new-game dropdowns and
  -- flagged OUT in the UI.
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists teams_division_idx on teams (division_id);

-- Players ---------------------------------------------------------------------
-- Team rosters. Not in docs v3.0; added so the public site can answer
-- "who's on this team" and "what team is Bob on".
create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),

  -- TEXT, not integer, on purpose: "00" is a real and distinct softball jersey
  -- number, and an integer column would collapse it to 0. Sorted numerically in
  -- the UI where it parses as a number.
  jersey_number text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists players_team_idx on players (team_id);

-- A jersey number is unique within a team. Partial, so any number of players
-- may have no number yet without colliding with each other.
create unique index if not exists players_team_jersey_uidx
  on players (team_id, jersey_number)
  where jersey_number is not null;

-- Two players with the same name on the same team is, in a 15-person rec team,
-- essentially always a double entry — and without this, re-importing a roster
-- CSV silently duplicates the whole squad. Genuine namesakes need a
-- distinguishing suffix ("Mike Smith Jr").
create unique index if not exists players_team_name_uidx
  on players (team_id, lower(trim(name)));

-- Fields ---------------------------------------------------------------------
create table if not exists fields (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  address     text,
  map_url     text,
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Games ----------------------------------------------------------------------
-- One row per GAME (round), not per matchup. A double header is two rows that
-- share date + field + the same unordered pair of teams (docs Section 4).
create table if not exists games (
  id              uuid primary key default gen_random_uuid(),

  -- Docs 8.5: plain local date/time, NO timezone conversion. The league runs
  -- entirely in America/New_York; timestamptz here is how you get "the game
  -- shows up on the wrong day" bugs.
  game_date       date not null,
  start_time      time,

  -- Which game of the day this is between these two teams: 1, 2, 3…
  --
  -- Docs v3.0 Section 4 caps a matchup at two games and rejects a third. Real
  -- KCSL data has tripleheaders (9:00 / 10:00 / 11:00), so that cap is wrong.
  -- This is a display/ordering label with a loose sanity bound — NOT the
  -- duplicate rule. The duplicate rule is games_matchup_slot_uidx below:
  -- the same two teams may play any number of games on one date and field,
  -- but never two at the same time.
  game_number     smallint not null default 1 check (game_number between 1 and 9),

  -- Which division's schedule this game belongs to. Used for SCHEDULE FILTERING.
  -- Standings are computed from teams.division_id instead — see lib/standings.js.
  division_id     uuid not null references divisions(id) on delete restrict,

  home_team_id    uuid not null references teams(id)  on delete restrict,
  visitor_team_id uuid not null references teams(id)  on delete restrict,
  field_id        uuid not null references fields(id) on delete restrict,

  status          game_status not null default 'tbp',
  home_score      integer check (home_score    >= 0),
  visitor_score   integer check (visitor_score >= 0),
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint games_distinct_teams check (home_team_id <> visitor_team_id),

  -- A final game must have both scores; anything else must have neither
  -- half-entered. (Cancelled games in legacy exports often carry a bogus 0-0 —
  -- those are imported as NULL.)
  constraint games_final_needs_scores check (
    status <> 'final'
    or (home_score is not null and visitor_score is not null)
  ),

  -- Normalized unordered team pair, used for matchup identity. Docs Section 4:
  -- swapping which team is "home" in Game 2 does NOT create a new matchup.
  -- CASE is used rather than LEAST/GREATEST because generated columns require a
  -- provably immutable expression.
  team_lo uuid generated always as (
    case when home_team_id < visitor_team_id then home_team_id else visitor_team_id end
  ) stored,
  team_hi uuid generated always as (
    case when home_team_id < visitor_team_id then visitor_team_id else home_team_id end
  ) stored
);

-- DUPLICATE PREVENTION (docs Section 4, "matchup identity").
-- A matchup = date + field + unordered team pair. Swapping which team is home
-- in a later game does NOT create a new matchup — team_lo/team_hi normalize
-- the pair, so both indexes below see a swapped Game 2 as the same matchup.

-- (a) Two rows cannot claim the same round of the same matchup.
create unique index if not exists games_matchup_round_uidx
  on games (game_date, field_id, team_lo, team_hi, game_number);

-- (b) Two games of the same matchup cannot occupy the same time slot. This is
-- the real duplicate guard: re-importing a schedule CSV produces rows with the
-- SAME start times as the ones already there, and this rejects them at the
-- database level regardless of what game_number the importer picked.
-- NULLS NOT DISTINCT (Postgres 15+) means two rows with no start time still
-- collide, rather than slipping through as "unknown".
create unique index if not exists games_matchup_slot_uidx
  on games (game_date, field_id, team_lo, team_hi, start_time) nulls not distinct;

create index if not exists games_date_idx     on games (game_date);
create index if not exists games_division_idx on games (division_id);
create index if not exists games_home_idx     on games (home_team_id);
create index if not exists games_visitor_idx  on games (visitor_team_id);

-- Announcements --------------------------------------------------------------
create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  active     boolean not null default true,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists announcements_active_idx on announcements (active, pinned, created_at desc);

-- Rules document -------------------------------------------------------------
-- Single-row table: only one active rules PDF at a time (docs Section 4).
create table if not exists rules_document (
  id         smallint primary key default 1 check (id = 1),
  file_path  text,          -- path inside the 'rules' storage bucket
  public_url text,          -- public URL served to the Rules page
  file_name  text,
  updated_at timestamptz not null default now()
);
insert into rules_document (id) values (1) on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists games_updated_at on games;
create trigger games_updated_at before update on games
  for each row execute function set_updated_at();

drop trigger if exists players_updated_at on players;
create trigger players_updated_at before update on players
  for each row execute function set_updated_at();

drop trigger if exists announcements_updated_at on announcements;
create trigger announcements_updated_at before update on announcements
  for each row execute function set_updated_at();

drop trigger if exists rules_document_updated_at on rules_document;
create trigger rules_document_updated_at before update on rules_document
  for each row execute function set_updated_at();


-- ============================================================================
-- 4. ROW LEVEL SECURITY — docs Section 8
--
-- This is the REAL access boundary. The React admin route guard is UX only; it
-- does not stop anyone from calling the REST API directly with the publishable
-- key that ships in the JS bundle.
-- ============================================================================

alter table divisions      enable row level security;
alter table teams          enable row level security;
alter table players        enable row level security;
alter table fields         enable row level security;
alter table games          enable row level security;
alter table announcements  enable row level security;
alter table rules_document enable row level security;

-- Clean slate so this file can be re-run safely.
drop policy if exists divisions_public_read      on divisions;
drop policy if exists divisions_admin_all        on divisions;
drop policy if exists teams_public_read          on teams;
drop policy if exists teams_admin_all            on teams;
drop policy if exists players_public_read        on players;
drop policy if exists players_admin_all          on players;
drop policy if exists fields_public_read         on fields;
drop policy if exists fields_admin_all           on fields;
drop policy if exists games_public_read          on games;
drop policy if exists games_admin_all            on games;
drop policy if exists announcements_public_read  on announcements;
drop policy if exists announcements_admin_all    on announcements;
drop policy if exists rules_public_read          on rules_document;
drop policy if exists rules_admin_write          on rules_document;

-- Divisions / Teams / Fields / Games: world-readable, admin-writable ----------
create policy divisions_public_read on divisions
  for select to anon, authenticated using (true);
create policy divisions_admin_all on divisions
  for all to authenticated using (true) with check (true);

create policy teams_public_read on teams
  for select to anon, authenticated using (true);
create policy teams_admin_all on teams
  for all to authenticated using (true) with check (true);

create policy players_public_read on players
  for select to anon, authenticated using (true);
create policy players_admin_all on players
  for all to authenticated using (true) with check (true);

create policy fields_public_read on fields
  for select to anon, authenticated using (true);
create policy fields_admin_all on fields
  for all to authenticated using (true) with check (true);

create policy games_public_read on games
  for select to anon, authenticated using (true);
create policy games_admin_all on games
  for all to authenticated using (true) with check (true);

-- Announcements: the public may ONLY ever see active ones --------------------
-- Enforced here, not in the UI. An inactive announcement is not merely hidden;
-- it is not returned by the API to an anonymous caller at all.
create policy announcements_public_read on announcements
  for select to anon using (active = true);
create policy announcements_admin_all on announcements
  for all to authenticated using (true) with check (true);

-- Rules pointer: public read, admin update -----------------------------------
create policy rules_public_read on rules_document
  for select to anon, authenticated using (true);
create policy rules_admin_write on rules_document
  for all to authenticated using (true) with check (true);


-- ============================================================================
-- 5. STORAGE — rules PDF bucket
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rules', 'rules', true, 20971520, array['application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rules_bucket_public_read on storage.objects;
drop policy if exists rules_bucket_admin_write on storage.objects;

create policy rules_bucket_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'rules');

-- The 20MB cap and the application/pdf restriction above are enforced by
-- Storage itself, so the client-side check in AdminRules.jsx is convenience,
-- not the boundary (docs Section 8.6).
create policy rules_bucket_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'rules')
  with check (bucket_id = 'rules');


-- ============================================================================
-- 6. IF YOU LATER ADD NON-ADMIN LOGINS — switch to an allow-list
--
-- The policies above trust every authenticated account. The moment you enable
-- public sign-up or create logins for players/coaches, run this instead:
--
--   create table admins (
--     user_id uuid primary key references auth.users(id) on delete cascade,
--     email   text,
--     created_at timestamptz not null default now()
--   );
--   alter table admins enable row level security;
--   create policy admins_self_read on admins
--     for select to authenticated using (user_id = (select auth.uid()));
--
--   create or replace function is_admin() returns boolean
--     language sql security definer stable set search_path = public as $fn$
--       select exists (select 1 from admins where user_id = auth.uid());
--     $fn$;
--
-- ...then replace every `using (true) with check (true)` admin policy above
-- with `using (is_admin()) with check (is_admin())`, and insert your own
-- auth.users id into `admins`.
-- ============================================================================
