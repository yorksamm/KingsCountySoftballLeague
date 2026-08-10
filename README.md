# Kings County Softball League — Web App

React 18 + Vite + Supabase. Public site (no login) plus a password-protected
admin panel. Built to the v3.0 spec.

---

## Setup — about 15 minutes

You need [Node.js](https://nodejs.org) 18 or newer. Check with `node --version`.

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project
   (free tier is fine). Save the database password somewhere safe — you won't
   need it for this app, but you can't recover it later.
2. Wait for the project to finish provisioning (~2 minutes).

### 2. Create the tables and security policies

In the Supabase dashboard: **SQL Editor → New query**, paste the entire contents
of [`supabase_schema.sql`](supabase_schema.sql), and click **Run**.

This creates every table, the constraints that keep bad data out, and the Row
Level Security policies that are the app's actual security boundary. It is safe
to re-run.

**Then load the league data.** Paste and run [`supabase_seed.sql`](supabase_seed.sql)
the same way. That loads both division rosters, the field list, and the full
2026 schedule — 109 games, including the four upcoming August 9 fixtures. Read
the assumptions listed at the top of that file; a few need your confirmation.

The whole seed file is safe to re-run: existing rows are updated or skipped and
nothing is duplicated. So when you add a new slate of games to it, just run the
file again.

If you'd rather start empty, skip the seed.

### 3. Create your admin login

**Authentication → Users → Add user**. Enter your email and a password, and tick
*Auto Confirm User*. There is no public sign-up — every admin account is created
here by hand.

### 4. Point the app at your project

In Supabase, go to **Settings → API** and copy the **Project URL** and the
**public API key** (Supabase has been renaming these — it may be labelled
`anon`, `public`, or `publishable`. It is the one marked safe for browsers, not
`service_role`).

Then, in this folder:

```bash
cp .env.example .env.local
```

Open `.env.local` and paste both values in.

### 5. Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. The admin panel is at `/admin`.

> Editing `.env.local` later? Restart `npm run dev`. Vite only reads env files at
> startup, and this is the single most common "why is it broken" moment.

### 6. Deploy

Push to GitHub, then import the repo at [vercel.com](https://vercel.com). Vercel
detects Vite automatically. Add the same variables under **Project Settings →
Environment Variables** — they are not read from `.env.local`, which is
gitignored on purpose.

Or from the terminal:

```bash
npm run build
npx vercel --prod
```

### 7. Search engines

> **Never put a `"comment"` key in `vercel.json`.** JSON has no comment syntax
> and Vercel validates the file against a strict schema — an unknown property
> fails the build with `should NOT have additional property 'comment'`, and
> Vercel silently keeps serving the previous deployment. Explain the config
> here in the README instead.

`vercel.json` is **required**, not optional. Without its rewrite, Vercel looks
for a real file at `/schedule` and returns 404 — only `/` works. That breaks
refreshing, bookmarking and sharing any page other than the home page, and it
means Google has nothing to index.

Also shipped: `public/robots.txt`, `public/sitemap.xml`, per-page titles and
descriptions (`src/hooks/usePageMeta.js`), canonical URLs, Open Graph tags for
link previews, and `noindex` on `/admin`.

**Google will not find the site on its own quickly.** Do this once:

1. [Google Search Console](https://search.google.com/search-console) → add a
   **URL prefix** property for your full site URL.
2. Verify by **HTML tag** — paste the `<meta name="google-site-verification" …>`
   into `index.html`'s `<head>`, redeploy, then click Verify.
3. **Sitemaps** → submit `sitemap.xml`.
4. **URL Inspection** → paste your home page URL → **Request Indexing**. Repeat
   for `/schedule`, `/standings` and `/teams`. This is the part that turns weeks
   into days.

Bing has the same flow at [Bing Webmaster Tools](https://www.bing.com/webmasters),
and it can import everything from Search Console in one click.

**Moving to a custom domain?** Update the hostname in `public/robots.txt` and
`public/sitemap.xml`, set `VITE_SITE_URL` in Vercel's environment variables, and
add the new domain as its own Search Console property.

---

## Security, in one paragraph

The API key in `.env.local` ships inside the JavaScript bundle and is visible to
anyone who opens dev tools. **That is by design and it is fine** — but only
because every table has RLS policies making that key useless for anything beyond
the intended public reads. The React admin route guard is a convenience for
humans; it stops nobody from calling the REST API directly. If you ever change
the schema, change the policies with it.

Verified behaviour of the shipped policies:

| Actor | Can do | Cannot do |
|---|---|---|
| Anonymous visitor | Read divisions, teams, fields, games, the rules pointer, and **active** announcements | Any insert, update, or delete. Cannot read inactive announcements even by asking for them directly |
| Signed-in admin | Everything, including inactive announcements | — |

Two rules that matter if you extend this:

- **Never** put the `service_role` key in a `VITE_` variable or any file the
  client imports. That prefix is precisely what inlines a value into the public
  bundle.
- **Never** render user-supplied content with `dangerouslySetInnerHTML`. Plain
  React rendering escapes automatically, and the auth session lives in
  `localStorage` where an injected script could read it.

`supabase_schema.sql` ends with a commented-out admin allow-list. Every
authenticated account is currently trusted as an admin — the moment you add
logins for anyone who isn't league management, switch to that block.

---

## How the league logic works

### Scores are always Visitor – Home

`7 – 4` means the visitor scored 7 and the home team 4, so the home team lost.
This holds everywhere on the site.

### Ties

There is no "tie" status. A tie is a game with status `final` and equal scores.
W/L/T is derived from the score every time it's displayed, never stored — so
standings can't drift out of sync with the schedule.

### Forfeits

| Status | Home | Visitor | Counts? |
|---|---|---|---|
| `forfeit` | no result | no result | **No** — excluded until resolved |
| `forfeit_loss` | Loss | Win | Yes |
| `forfeit_win` | Win | Loss | Yes |

These names come from the spec and are relative to the *home* team, which is
genuinely easy to get backwards — `forfeit_win` hands the *visiting* team a
loss. The admin dropdowns spell out which team forfeited, so you only face the
raw values in a CSV. A resolved forfeit awards the W/L but contributes **no runs**
to RF, RA, or RD.

### Double headers, tripleheaders, and duplicate prevention

A matchup is `date + field + the unordered pair of teams`. Rows sharing all
three are the games of one matchup — usually two, sometimes three.

**The duplicate rule:** the same two teams may play any number of games on one
date and field, but **never two at the same start time**. That's what an
accidentally re-imported file looks like, and it's rejected by the database
(`games_matchup_slot_uidx`), not just by the import validator.

Swapping which team is "home" in a later game does **not** create a new matchup
— the database normalizes the pair, so a swapped duplicate is caught too.

> Docs v3.0 §4 says a matchup caps at two games and a third must be rejected.
> Real KCSL data has tripleheaders, so that rule is not implemented. If you
> built your database before this changed, run
> [`supabase_migration_01_tripleheaders.sql`](supabase_migration_01_tripleheaders.sql).

### Entering a score never means setting a status

A score and a status are not two separate facts. Typing both scores into a game
that is `tbp` or `not_reported` marks it `final` automatically — in the admin
table, in the score sheet, and in the schedule importer. The import result tells
you how many games it promoted.

The rule only runs from those two "awaiting a result" statuses. A score on a
`cancelled`, `postponed`, `suspended`, or forfeited game is still an error,
because those genuinely have no result — that's a contradiction to be looked at,
not a status someone forgot to change.

### The home page is league news

The landing page is the announcements, in full — headings, lists, links and all.
Games have their own page at `/upcoming`, reachable from the nav and from the
"Next games" strip at the top of the home page.

Two switches control where an announcement appears:

| | Effect |
|---|---|
| **Published** | Shows on the home page, newest first. Unpublished ones aren't readable by the public at all — that's the RLS policy, not just a hidden UI element. |
| **Important** | Also pins it to the top of the home page *and* puts it in the orange banner on every page. Only the newest Important one is bannered. |

#### Formatting, without a markdown library

Announcement bodies support headings, bullet and numbered lists, bold, italic,
**underline** (`++text++`), **text colour** (`{red:text}`), links and dividers. The admin editor has toolbar buttons for all of it plus a
live preview, so nobody has to learn the syntax — but the syntax is there for
anyone who wants it (`## Heading`, `- bullet`, `**bold**`, `[text](url)`, `---`).

Colour is a **fixed five-colour palette** — red, green, blue, orange, gray —
not a colour picker. A free picker invites pale yellow on white, and a league
notice is the one place text has to stay readable. Every colour is verified at
WCAG AA or better against the white card (lowest is red at 6.3:1). Add one only
after checking its contrast. Colour and underline nest with each other and with
bold, so `{red:++urgent++}` works.

**This is deliberately not a markdown library.** Every markdown package
ultimately hands you an HTML string, which means `dangerouslySetInnerHTML`, and
docs §8.3 rules that out — the admin session token lives in `localStorage`, and
announcement bodies are the one place a human types content that everyone else
reads. `src/lib/richText.jsx` parses the text and builds **React elements**, so
there is no HTML string at any point and React escapes everything on its own.

Verified against a hostile body: `<script>` and `<img onerror=…>` render as
literal visible text with zero tags created and no globals set; `javascript:`
and `data:` links are stripped to plain text; only `http(s):`, `mailto:` and
internal paths become real links. If you extend the parser, keep that property.

### Rosters

Players have a name and an optional jersey number, and belong to one team.
On the public **Teams** page each card opens its roster in a popup, and a
**View all players** toggle switches to one searchable list of everyone in the
league (search matches player *and* team name). Admins manage them under
**Rosters**, one at a time or by CSV.

Jersey numbers are stored as **text**, not integers — `"00"` is a real softball
number and distinct from `"0"`, which an integer column would silently collapse.
They're sorted numerically anyway, and players without a number sort last.

Two database constraints exist specifically to make a re-imported roster fail
loudly instead of silently duplicating a squad: one name per team
(case- and whitespace-insensitive) and one jersey number per team. The same name
on two different teams is fine.

New database? `supabase_schema.sql` includes this. Existing one? Run
[`supabase_migration_02_rosters.sql`](supabase_migration_02_rosters.sql).

**Rosters are not seeded.** Inventing player names for your real teams risked
publishing fake people, so the table starts empty.

### Ordering

Games list **most recent game day first** — on the public Schedule, the admin
Schedule, and the Game Results table. Within a day the order is normal running
order (division, then start time), so a double header still reads 9:00 then
10:00.

The Upcoming page is the exception and stays soonest-first.

### Standings

```
Pct. = (Wins + Ties × 0.5) / Games Played
GB   = ((Leader W − Leader L) − (Team W − Team L)) / 2
RD   = RF − RA
```

Sorted by win percentage, then run differential. Counted: `final`,
`forfeit_loss`, `forfeit_win`. Excluded entirely: `tbp`, `not_reported`,
`cancelled`, `postponed`, `suspended`, and unresolved `forfeit`.

**Two things about this to be aware of**, both consequences of the spec's stated
formulas rather than bugs:

1. **GB misbehaves when teams have played very different numbers of games.** In
   your real data, BK FUEL (1 game, 0–1) shows GB 6.5 while TAINOS (22 games,
   6–16) shows 11.0 — so the team with six wins looks further back. The formula
   only uses W−L, which barely moves for a team that has hardly played. Standard
   for the formula; worth knowing before someone asks.
2. **Sorting purely on Pct. floats barely-played teams up the table.** TITANS
   went 1–1 before withdrawing and therefore sits 6th at .500, above STRAIGHT
   BALLERZ at 7–15. If you want a minimum-games-played threshold or want
   withdrawn teams pinned to the bottom, that's a small change in
   `src/lib/standings.js` — say the word.

### Divisions and standings membership — a deliberate deviation

The spec says the game row's `division` drives standings. Your data has
crossover games (MACHINE vs CARNAGE, GATORS vs SAINTS) where a C-division team
plays in a B-tagged game — read literally, SAINTS would appear in the B 2026
standings table with two games while its real record sits in C 2026.

So: **a division's standings list the teams assigned to that division**, and each
team's record counts every game it actually played. The game's `division` still
drives the Schedule page filter. One team, one row, one complete record.

To get the literal spec behaviour, flip `STANDINGS_ROSTER_BASED` to `false` at
the top of [`src/lib/standings.js`](src/lib/standings.js).

### Withdrawn teams

Not in the spec, but your data needs it — BLUE DEVILS, TITANS, and SUNDAY SAUCE
are all marked `- out` mid-season. Teams have an **Active** checkbox. Unchecking
it keeps every game and standings position intact, flags the team `OUT` across
the site, and removes it from dropdowns when scheduling new games. Use it instead
of deleting — the app blocks deleting any team that has games.

### Timezones

Dates and times are stored and displayed as plain local values, with no UTC
conversion anywhere. The league runs entirely in America/New_York, and
timezone-aware storage is the classic source of "the game shows up on the wrong
day" bugs. If you ever add a second timezone this is the thing to revisit.

---

## Using the admin panel

`/admin` — sign in with the account you made in step 3.

| Page | What it's for |
|---|---|
| **Game Results** | Enter scores. One row per game, newest game day first, so you can tab straight down the score columns. Typing both scores marks the game **Final** on its own — you never set the status first. Edited rows turn yellow; nothing saves until **Save all changes**. **Download sheet** / **Upload scores** do the same job via a spreadsheet. |
| **Schedule** | Add, edit, and delete individual games. CSV import lives here. |
| **Teams** | Team names, contacts, the Active flag. CSV import here too. |
| **Rosters** | Players and jersey numbers, filterable by division and team and searchable by name. CSV import. |
| **Divisions** | Rename and reorder (drag the handle, or focus it and press ↑/↓). |
| **Fields** | Addresses, map links, and the parking/entrance notes that show on every game card. |
| **Announcements** | Banner notices. **Active** controls public visibility; **Pinned** forces one to the top. |
| **Rules PDF** | Upload the rulebook. One active file at a time; replacing deletes the old one. PDF only, 20MB max, enforced both in the browser and by the storage bucket. |

Divisions, teams, and fields can't be deleted while anything references them —
the UI disables the button and the database refuses independently.

### CSV imports

See [`CSV_TEMPLATES.txt`](CSV_TEMPLATES.txt) for the full format reference and
a list of the errors you're most likely to hit.

Every import dialog has a **Download template** button — a CSV with the correct
headers and no rows. The worked example stays on screen rather than in the file,
so the sample rows can't be imported by accident. (Game Results is the
exception: its download is the real games, already filled in.)

Imports are **all-or-nothing**. Every row is checked first; if any row fails,
nothing is written and you get the problems listed by row number, with
"did you mean…" suggestions for near-miss names. The most common failure by far
is inconsistent field-name spacing — your existing data mixes `Marine Pk #5` and
`Marine Pk # 5`. The seed normalizes everything to `Marine Pk # 5`.

---

## Project structure

```
src/
├── lib/
│   ├── supabase.js      Client singleton
│   ├── constants.js     Status vocabulary, what counts toward standings
│   ├── standings.js     W/L/T derivation, standings math, matchup grouping
│   ├── format.js        Timezone-safe date/time formatting
│   ├── csv.js           Import validation (validate-then-write)
│   ├── api.js           Public read-only queries
│   └── adminApi.js      Admin CRUD, imports, PDF upload
├── context/AuthContext.jsx
├── hooks/useQuery.js
├── components/{ui,layout,games,admin}/
└── pages/ + pages/admin/
```

The league rules live in `standings.js` and `constants.js` — if a calculation
looks wrong, those two files are where to look, and they have no I/O in them.

---

## What was verified

- Production build compiles clean.
- `supabase_schema.sql` and `supabase_seed.sql` run against Postgres 16 with no
  errors; all 109 games, 20 teams, 14 fields land. Running the seed twice
  leaves the counts unchanged.
- Constraints reject: a third game in a matchup, **the same duplicate with
  home/visitor swapped**, `game_number` 3, a `final` game missing a score, a
  team playing itself, and deleting a division that still has teams.
- RLS verified by querying as the `anon` role: reads work, every write is
  refused, and the inactive announcement is invisible even when asked for by
  name. As `authenticated`, all three announcements are visible and writes
  succeed.
- Standings recomputed from the seed and checked by hand; forfeit derivation
  checked in all three directions.
- Every public page rendered against a live Postgres via PostgREST — including
  the swapped-sides double header (each team's runs land in its own column,
  tagged H/V) and a resolved forfeit (W/L shown in place of a score).
- Duplicate rule exercised directly: a 3rd, 4th and 5th game of one matchup at
  new times are accepted; a second game in an already-used slot is rejected in
  both team orders; the same teams and time at a *different* field is allowed.
- Score sheet round-tripped: an untouched export re-imports as zero changes,
  edited rows produce exactly those updates, a team renamed between download and
  upload still matches (the key is game_id), and six malformed-row cases are
  each rejected with a readable message.
- Score entry driven in a real browser: typing multiple characters into a modal
  field keeps focus, edited rows highlight, and Save writes through to Postgres.

---

## Not built (deferred in the spec)

iCal subscription links, sponsor logos, email list signup, visitor counter. None
of them affect the data model, so any can be added later without a migration.
