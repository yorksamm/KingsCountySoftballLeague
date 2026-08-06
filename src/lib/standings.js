/**
 * Result derivation and standings math. Docs Sections 3, 6, 7.
 *
 * All of it is pure — given games + teams it returns rows. No I/O. That means
 * standings never drift from the schedule: there is no stored W/L to go stale,
 * every table is recomputed from game rows on read.
 */

import { STATUS, STANDINGS_COUNTED, RUNS_COUNTED } from './constants.js'

/**
 * ---------------------------------------------------------------------------
 * DEVIATION FROM DOCS v3.0 — read this before changing it.
 *
 * Docs Section 5 says "the row's division field is what's used for
 * standings/filtering". Taken literally, a division's standings table would be
 * built from every game TAGGED with that division, and would therefore include
 * any out-of-division opponent as a row. In the real 2026 data that puts
 * CARNAGE and SAINTS (both C 2026 teams) into the B 2026 standings with two
 * games each, while their actual C 2026 record lives in a different table.
 *
 * true  (default) — a division's standings list the teams ASSIGNED to that
 *                   division, and each team's record counts every game it
 *                   played regardless of how the game row is tagged. One team,
 *                   one row, one complete record.
 * false           — literal spec behaviour: rows are derived from games tagged
 *                   with the division, opponents from elsewhere included.
 *
 * The game's own `division` is still what drives the Schedule page filter in
 * both modes.
 * ---------------------------------------------------------------------------
 */
export const STANDINGS_ROSTER_BASED = true

/**
 * Derive W / L / T for one team in one game. Docs Section 3 derivation rule
 * and Section 6 forfeit table. Returns null when the game does not count.
 *
 * @param {object} game
 * @param {'home'|'visitor'} side
 * @returns {'W'|'L'|'T'|null}
 */
export function deriveResult(game, side) {
  if (!game) return null

  switch (game.status) {
    case STATUS.FINAL: {
      const v = game.visitor_score
      const h = game.home_score
      if (v == null || h == null) return null
      // A tie is simply a final game with equal scores. There is no separate
      // tie status — docs Section 3.
      if (v === h) return 'T'
      const visitorWon = v > h
      return side === 'visitor'
        ? (visitorWon ? 'W' : 'L')
        : (visitorWon ? 'L' : 'W')
    }

    // Named relative to the HOME team, per docs Section 6:
    //   forfeit_loss = home forfeited  -> home L, visitor W
    //   forfeit_win  = visitor forfeited -> home W, visitor L
    case STATUS.FORFEIT_LOSS:
      return side === 'home' ? 'L' : 'W'
    case STATUS.FORFEIT_WIN:
      return side === 'home' ? 'W' : 'L'

    // Unresolved forfeit assigns no result to anyone until the league resolves
    // it to forfeit_loss or forfeit_win.
    default:
      return null
  }
}

/** Does this game contribute to Won/Lost/Tied/Games Played? */
export function countsForStandings(game) {
  return STANDINGS_COUNTED.has(game?.status)
}

/**
 * Does this game contribute runs to RF/RA/RD?
 * Only `final`. A resolved forfeit awards the W/L but its score — if any was
 * ever recorded — is not applied to run differential (docs Section 6).
 */
export function countsForRuns(game) {
  return RUNS_COUNTED.has(game?.status)
    && game.home_score != null
    && game.visitor_score != null
}

function blankRow(team) {
  return {
    team_id: team.id,
    team: team.name,
    division_id: team.division_id,
    is_active: team.is_active !== false,
    won: 0, lost: 0, tied: 0,
    gp: 0, rf: 0, ra: 0,
  }
}

/**
 * Build one division's standings table.
 *
 * @param {object[]} games  all games (already joined or raw with *_team_id)
 * @param {object[]} teams  all teams
 * @param {string}   divisionId
 * @returns {object[]} sorted rows with won/lost/tied/pct/gb/rf/ra/rd
 */
export function computeStandings(games, teams, divisionId) {
  const rows = new Map()

  if (STANDINGS_ROSTER_BASED) {
    // Every team on the division roster gets a row, even at 0–0.
    for (const t of teams) {
      if (t.division_id === divisionId) rows.set(t.id, blankRow(t))
    }
  }

  const teamById = new Map(teams.map((t) => [t.id, t]))

  for (const game of games) {
    if (!countsForStandings(game)) continue
    if (!STANDINGS_ROSTER_BASED && game.division_id !== divisionId) continue

    for (const side of ['home', 'visitor']) {
      const teamId = side === 'home' ? game.home_team_id : game.visitor_team_id
      const team = teamById.get(teamId)
      if (!team) continue

      if (!rows.has(teamId)) {
        // Roster-based mode: skip teams from other divisions entirely.
        if (STANDINGS_ROSTER_BASED) continue
        rows.set(teamId, blankRow(team))
      }
      const row = rows.get(teamId)

      const result = deriveResult(game, side)
      if (result === 'W') row.won++
      else if (result === 'L') row.lost++
      else if (result === 'T') row.tied++
      else continue          // no result assigned -> not a game played

      row.gp++

      if (countsForRuns(game)) {
        const forThis = side === 'home' ? game.home_score : game.visitor_score
        const against = side === 'home' ? game.visitor_score : game.home_score
        row.rf += forThis
        row.ra += against
      }
    }
  }

  const table = [...rows.values()].map((r) => ({
    ...r,
    // Pct. = (Wins + Ties × 0.5) / Games Played. A team with no counted games
    // is .000 rather than NaN.
    pct: r.gp > 0 ? (r.won + r.tied * 0.5) / r.gp : 0,
    rd: r.rf - r.ra,
  }))

  // Sort: win percentage first, run differential as tiebreaker (docs Section 7).
  // Team name breaks a full tie so the order is stable between renders.
  table.sort((a, b) =>
    b.pct - a.pct ||
    b.rd - a.rd ||
    a.team.localeCompare(b.team)
  )

  // GB = ((Leader W − Leader L) − (Team W − Team L)) / 2, measured against the
  // team sitting first after the sort above.
  const leader = table[0]
  for (const row of table) {
    row.gb = leader
      ? ((leader.won - leader.lost) - (row.won - row.lost)) / 2
      : 0
  }

  return table
}

/**
 * A single team's record, for the Teams page cards.
 * Always counts every game the team played, in any division.
 */
export function computeTeamRecord(games, teamId) {
  let won = 0, lost = 0, tied = 0
  for (const game of games) {
    if (!countsForStandings(game)) continue
    const side = game.home_team_id === teamId ? 'home'
      : game.visitor_team_id === teamId ? 'visitor'
      : null
    if (!side) continue
    const result = deriveResult(game, side)
    if (result === 'W') won++
    else if (result === 'L') lost++
    else if (result === 'T') tied++
  }
  const gp = won + lost + tied
  return { won, lost, tied, gp, pct: gp > 0 ? (won + tied * 0.5) / gp : 0 }
}

/**
 * Group game rows into matchup cards. Docs Section 4: a matchup is
 * date + field + the UNORDERED pair of teams, so a Game 2 with home/visitor
 * swapped still belongs to the same card.
 *
 * @returns {object[]} [{ key, game_date, field, division, games: [g1, g2] }]
 */
export function groupIntoMatchups(games, { newestFirst = false } = {}) {
  const map = new Map()

  for (const game of games) {
    const pair = [game.home_team_id, game.visitor_team_id].sort().join('~')
    const key = `${game.game_date}|${game.field_id}|${pair}`

    if (!map.has(key)) {
      map.set(key, {
        key,
        game_date: game.game_date,
        field: game.field,
        field_id: game.field_id,
        division: game.division,
        division_id: game.division_id,
        // The card labels each column from the Game 1 row, so a swapped Game 2
        // does not flip the card's heading.
        anchor: game,
        games: [],
      })
    }
    map.get(key).games.push(game)
  }

  for (const matchup of map.values()) {
    matchup.games.sort((a, b) =>
      (a.game_number ?? 1) - (b.game_number ?? 1) ||
      String(a.start_time ?? '').localeCompare(String(b.start_time ?? ''))
    )
    matchup.anchor = matchup.games[0]
  }

  // Date, then the admin-defined division order, then time, then field.
  // Division outranks time because a game day is read division by division —
  // without it, an all-9:00am slate would sort by field name and interleave
  // the divisions arbitrarily.
  //
  // `newestFirst` flips ONLY the date. Within a given game day the order stays
  // ascending, so a double header still reads 9:00 then 10:00 rather than
  // backwards.
  const dateDirection = newestFirst ? -1 : 1

  return [...map.values()].sort((a, b) =>
    dateDirection * a.game_date.localeCompare(b.game_date) ||
    (a.division?.sort_order ?? 0) - (b.division?.sort_order ?? 0) ||
    String(a.division?.name ?? '').localeCompare(String(b.division?.name ?? '')) ||
    String(a.anchor?.start_time ?? '').localeCompare(String(b.anchor?.start_time ?? '')) ||
    String(a.field?.name ?? '').localeCompare(String(b.field?.name ?? ''))
  )
}
