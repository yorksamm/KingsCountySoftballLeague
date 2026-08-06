/**
 * CSV import — validate everything, then write. Docs Section 5.
 *
 * The rule is all-or-nothing per file: if ANY row fails, nothing is written and
 * the admin gets a table of errors by row number. Nothing here writes to the
 * database; validation returns a plan that adminApi.js executes as a single
 * bulk insert (one statement = one implicit transaction in Postgres).
 */

import Papa from 'papaparse'
import {
  VALID_CSV_STATUSES, STATUS, MAX_GAMES_PER_MATCHUP, AWAITING_RESULT,
} from './constants.js'

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Read a File's text, with an explanation instead of a raw DOMException.
 *
 * WHY THIS EXISTS: handing a File straight to Papa.parse defers the disk read
 * until parse time, which can be minutes after the user picked the file. Excel
 * and Numbers on macOS "save" by writing a new file and replacing the old one,
 * and iCloud/Desktop sync does the same — so by then the File reference points
 * at an inode that no longer exists and the read fails with NotReadableError
 * ("The requested file could not be read, typically due to permission
 * problems…"). Reading the bytes the moment the file is chosen removes the
 * whole race.
 */
export async function readCsvText(file) {
  try {
    return await file.text()
  } catch (err) {
    throw new Error(
      `Couldn't read "${file?.name ?? 'that file'}". This usually means the file changed on disk after you selected it. ` +
      'Close it in Excel or Numbers, make sure it has finished downloading from iCloud, then choose the file again.'
    )
  }
}

/**
 * Parse CSV into rows. Accepts already-read text (preferred) or a File.
 *
 * Header names are lowercased and trimmed so a stray "Home_Team" or trailing
 * space in the header line doesn't sink the import. VALUES are trimmed but NOT
 * case-folded — team/field names must match exactly (docs Section 5).
 */
export async function parseCsvFile(input) {
  const raw = typeof input === 'string' ? input : await readCsvText(input)

  // Excel writes a UTF-8 BOM. trim() strips U+FEFF so the header transform
  // already handles it, but removing it up front keeps the first cell of the
  // first data row clean too.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw

  // skipEmptyLines is deliberately OFF so row numbers stay true to the file.
  //
  // Letting Papa drop blank rows renumbers everything after them: Excel happily
  // appends a dozen comma-only rows below your data, and a stray character in
  // one of them was being reported as "Row 3" when it was physically row 8 —
  // a row number the admin cannot find. Blank rows are filtered below instead,
  // AFTER each row has been stamped with its real spreadsheet line.
  const results = Papa.parse(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
    transform: (value) => (typeof value === 'string' ? value.trim() : value),
  })

  const rows = results.data
    .map((data, i) => ({ data, line: i + 2 }))   // header is line 1
    .filter(({ data }) => !isBlankRow(data))

  return { meta: results.meta, errors: results.errors, data: results.data, rows }
}

/** Every cell empty — a spreadsheet leftover, not something to complain about. */
export function isBlankRow(row) {
  return Object.values(row ?? {}).every((v) => v == null || String(v).trim() === '')
}

/**
 * One clear error for a row that has nothing identifying in it.
 *
 * Excel leaves comma-only rows below your data, and a single stray keystroke in
 * one turns into a row with no date, no teams and no field. Validating it
 * normally produces five or six cascading "X is required" messages for what is
 * really one instruction: delete the row.
 */
function leftoverRowError(line, data) {
  const stray = Object.entries(data)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k} = "${v}"`)

  return {
    row: line,
    message:
      'Leftover empty row from your spreadsheet' +
      (stray.length ? ` — the only thing in it is ${stray.join(', ')}` : '') +
      '. Select the blank rows below your data and delete the whole rows ' +
      '(right-click → Delete Row — clearing the cells is not enough), then save and re-upload.',
  }
}

/* -------------------------------------------------------------------------- */
/* "Did you mean…" suggestions                                                 */
/* -------------------------------------------------------------------------- */

function editDistance(a, b) {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const curr = [i]
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = curr
  }
  return prev[n]
}

/**
 * Closest existing name, for the error message the docs call for:
 *   "Row 4: field 'Marine Pk #5' not found — did you mean 'Marine Pk # 5'?"
 * Whitespace/case differences are weighted lightly so they surface first —
 * they're by far the most common cause of a failed import.
 */
function suggest(value, candidates) {
  if (!value) return null
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '')
  const target = norm(value)

  const exactIgnoringSpaceAndCase = candidates.find((c) => norm(c) === target)
  if (exactIgnoringSpaceAndCase) return exactIgnoringSpaceAndCase

  let best = null
  let bestScore = Infinity
  for (const c of candidates) {
    const score = editDistance(target, norm(c))
    if (score < bestScore) { bestScore = score; best = c }
  }
  // Only suggest if it's genuinely close.
  return bestScore <= Math.max(2, Math.floor(target.length * 0.34)) ? best : null
}

function nameError(rowNum, label, value, candidates) {
  const hint = suggest(value, candidates)
  return {
    row: rowNum,
    message: `${label} '${value}' not found` + (hint ? ` — did you mean '${hint}'?` : ''),
  }
}

/* -------------------------------------------------------------------------- */
/* Field validators                                                            */
/* -------------------------------------------------------------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}$/

function validDate(value) {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(y, m - 1, d)
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
}

function validTime(value) {
  if (!TIME_RE.test(value)) return false
  const [h, min] = value.split(':').map(Number)
  return h >= 0 && h <= 23 && min >= 0 && min <= 59
}

/** '' / undefined -> null; otherwise a non-negative integer, or NaN if bad. */
function parseScore(value) {
  if (value == null || value === '') return null
  if (!/^\d+$/.test(String(value))) return NaN
  return Number(value)
}


/* -------------------------------------------------------------------------- */
/* Teams import                                                                */
/* -------------------------------------------------------------------------- */

const TEAM_COLUMNS = ['name', 'division', 'contact_name', 'contact_email']

/**
 * @returns {{ ok: boolean, errors: {row:number,message:string}[], rows: object[] }}
 */
export function validateTeamsCsv(parsed, { divisions, teams }) {
  const errors = []
  const rows = []

  const headers = parsed.meta?.fields ?? []
  for (const col of ['name', 'division']) {
    if (!headers.includes(col)) {
      errors.push({ row: 1, message: `Missing required column '${col}'. Expected header: ${TEAM_COLUMNS.join(',')}` })
    }
  }
  if (errors.length) return { ok: false, errors, rows: [] }

  const divisionByName = new Map(divisions.map((d) => [d.name, d]))
  const divisionNames = divisions.map((d) => d.name)
  const existingTeamNames = new Set(teams.map((t) => t.name))
  const seenInFile = new Map()

  parsed.rows.forEach(({ data: raw, line: n }) => {
    const name = raw.name ?? ''
    const divisionName = raw.division ?? ''

    // Nothing identifying in the row -> one instruction, not five.
    if (!name && !divisionName) { errors.push(leftoverRowError(n, raw)); return }

    if (!name) {
      errors.push({ row: n, message: 'Team name is required' })
    } else if (existingTeamNames.has(name)) {
      errors.push({ row: n, message: `Team '${name}' already exists — rename it in the admin panel instead of re-importing` })
    } else if (seenInFile.has(name)) {
      errors.push({ row: n, message: `Team '${name}' appears twice in this file (also row ${seenInFile.get(name)})` })
    } else {
      seenInFile.set(name, n)
    }

    const division = divisionByName.get(divisionName)
    if (!divisionName) {
      errors.push({ row: n, message: 'Division is required' })
    } else if (!division) {
      errors.push(nameError(n, 'Division', divisionName, divisionNames))
    }

    const email = raw.contact_email ?? ''
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: n, message: `Contact email '${email}' is not a valid address` })
    }

    if (division && name) {
      rows.push({
        name,
        division_id: division.id,
        contact_name: raw.contact_name || null,
        contact_email: email || null,
        is_active: true,
      })
    }
  })

  if (!parsed.rows.length) errors.push({ row: 1, message: 'File contains no data rows — add at least one row below the header.' })

  return { ok: errors.length === 0, errors, rows }
}

/* -------------------------------------------------------------------------- */
/* Schedule import                                                             */
/* -------------------------------------------------------------------------- */

const SCHEDULE_COLUMNS = [
  'game_date', 'start_time', 'division', 'home_team', 'visitor_team',
  'field', 'status', 'home_score', 'visitor_score', 'notes',
]

const matchupKey = (date, fieldId, homeId, visitorId) =>
  `${date}|${fieldId}|${[homeId, visitorId].sort().join('~')}`

/**
 * Validate a schedule CSV against existing divisions/teams/fields AND against
 * the games already in the database.
 *
 * Enforces matchup identity (docs Section 4): date + field + unordered team
 * pair may hold at most two rows. Assigns game_number 1/2 by start time.
 */
export function validateScheduleCsv(parsed, { divisions, teams, fields, games }) {
  const errors = []
  let autoFinalized = 0

  const headers = parsed.meta?.fields ?? []
  for (const col of ['game_date', 'division', 'home_team', 'visitor_team', 'field', 'status']) {
    if (!headers.includes(col)) {
      errors.push({ row: 1, message: `Missing required column '${col}'. Expected header: ${SCHEDULE_COLUMNS.join(',')}` })
    }
  }
  if (errors.length) return { ok: false, errors, rows: [] }

  const divisionByName = new Map(divisions.map((d) => [d.name, d]))
  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const fieldByName = new Map(fields.map((f) => [f.name, f]))
  const divisionNames = divisions.map((d) => d.name)
  const teamNames = teams.map((t) => t.name)
  const fieldNames = fields.map((f) => f.name)

  // What each matchup already holds in the live schedule: which round numbers
  // are used, and which time slots are occupied.
  const takenNumbers = new Map()
  const takenSlots = new Map()
  for (const g of games) {
    const key = matchupKey(g.game_date, g.field_id, g.home_team_id, g.visitor_team_id)
    if (!takenNumbers.has(key)) takenNumbers.set(key, new Set())
    takenNumbers.get(key).add(g.game_number ?? 1)
    if (!takenSlots.has(key)) takenSlots.set(key, new Set())
    // Normalize '09:00:00' from the DB against '09:00' from the CSV.
    takenSlots.get(key).add(String(g.start_time ?? '').slice(0, 5))
  }

  /** Rows that parsed cleanly, grouped by matchup so numbering can be assigned. */
  const staged = []

  parsed.rows.forEach(({ data: raw, line: n }) => {
    const before = errors.length

    // A row with no date, no division, no teams and no field is a spreadsheet
    // leftover. Report it once instead of cascading a "required" error per
    // column.
    if (!raw.game_date && !raw.division && !raw.home_team && !raw.visitor_team && !raw.field) {
      errors.push(leftoverRowError(n, raw))
      return
    }

    const gameDate = raw.game_date ?? ''
    if (!validDate(gameDate)) {
      errors.push({ row: n, message: `Invalid date '${gameDate}' — expected YYYY-MM-DD (e.g. 2026-06-21)` })
    }

    const startTime = raw.start_time ?? ''
    if (startTime && !validTime(startTime)) {
      errors.push({ row: n, message: `Invalid time '${startTime}' — expected 24-hour HH:MM (e.g. 09:00 or 13:30)` })
    }

    const division = divisionByName.get(raw.division ?? '')
    if (!raw.division) errors.push({ row: n, message: 'Division is required' })
    else if (!division) errors.push(nameError(n, 'Division', raw.division, divisionNames))

    const homeTeam = teamByName.get(raw.home_team ?? '')
    if (!raw.home_team) errors.push({ row: n, message: 'Home team is required' })
    else if (!homeTeam) errors.push(nameError(n, 'Team', raw.home_team, teamNames))

    const visitorTeam = teamByName.get(raw.visitor_team ?? '')
    if (!raw.visitor_team) errors.push({ row: n, message: 'Visitor team is required' })
    else if (!visitorTeam) errors.push(nameError(n, 'Team', raw.visitor_team, teamNames))

    if (homeTeam && visitorTeam && homeTeam.id === visitorTeam.id) {
      errors.push({ row: n, message: `'${homeTeam.name}' is listed as both home and visitor` })
    }

    const field = fieldByName.get(raw.field ?? '')
    if (!raw.field) errors.push({ row: n, message: 'Field is required (use a placeholder field such as TBD if the site is unknown)' })
    else if (!field) errors.push(nameError(n, 'Field', raw.field, fieldNames))

    const status = (raw.status ?? '').toLowerCase()
    if (!status) {
      errors.push({ row: n, message: 'Status is required' })
    } else if (!VALID_CSV_STATUSES.has(status)) {
      errors.push({
        row: n,
        message: `Invalid status '${raw.status}' — must be one of: ${[...VALID_CSV_STATUSES].join(' · ')}`,
      })
    }

    const homeScore = parseScore(raw.home_score)
    const visitorScore = parseScore(raw.visitor_score)
    if (Number.isNaN(homeScore)) errors.push({ row: n, message: `Home score '${raw.home_score}' is not a whole number` })
    if (Number.isNaN(visitorScore)) errors.push({ row: n, message: `Visitor score '${raw.visitor_score}' is not a whole number` })

    // Same courtesy as the results sheet: a score on a game that was merely
    // awaiting a result means the result has arrived, so promote it to final
    // instead of making the admin edit the status column as well.
    let effective = status
    if (!Number.isNaN(homeScore) && !Number.isNaN(visitorScore)) {
      const hasBoth = homeScore != null && visitorScore != null
      const hasEither = homeScore != null || visitorScore != null

      if (AWAITING_RESULT.has(status)) {
        if (hasBoth) {
          effective = STATUS.FINAL
          autoFinalized++
        } else if (hasEither) {
          errors.push({ row: n, message: 'Only one score entered — enter both, or clear the one you entered' })
        }
      }

      if (errors.length !== before) {
        // fall through to the shared bail-out below
      } else if (effective === STATUS.FINAL && !hasBoth) {
        errors.push({
          row: n,
          message: hasEither
            ? 'Only one score entered — a final game needs both'
            : 'Status is final but no score was entered — enter both scores, or use not_reported',
        })
      } else if (effective !== STATUS.FINAL && hasEither) {
        errors.push({
          row: n,
          message: `Status '${status}' cannot carry a score — a ${status} game has no result. Clear the score columns, or change the status if it was actually played.`,
        })
      }
    }

    if (errors.length !== before) return   // row failed; don't stage it

    staged.push({
      rowNum: n,
      key: matchupKey(gameDate, field.id, homeTeam.id, visitorTeam.id),
      startTime: startTime || null,
      record: {
        game_date: gameDate,
        start_time: startTime || null,
        division_id: division.id,
        home_team_id: homeTeam.id,
        visitor_team_id: visitorTeam.id,
        field_id: field.id,
        status: effective,
        home_score: effective === STATUS.FINAL ? homeScore : null,
        visitor_score: effective === STATUS.FINAL ? visitorScore : null,
        notes: raw.notes || null,
      },
      label: `${raw.visitor_team} at ${raw.home_team} on ${gameDate} at ${raw.field}`,
    })
  })

  if (!parsed.rows.length) errors.push({ row: 1, message: 'File contains no data rows — add at least one row below the header.' })

  // ---- Matchup identity: date + field + unordered team pair ----------------
  // A matchup may hold several games (double headers, and tripleheaders do
  // happen). What it may NOT hold is two games in the same time slot — that is
  // what an accidentally re-imported file looks like, and it's the check that
  // actually protects the data.
  const byMatchup = new Map()
  for (const row of staged) {
    if (!byMatchup.has(row.key)) byMatchup.set(row.key, [])
    byMatchup.get(row.key).push(row)
  }

  for (const [key, group] of byMatchup) {
    group.sort((a, b) =>
      String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')) ||
      a.rowNum - b.rowNum
    )

    const taken = new Set(takenNumbers.get(key) ?? [])
    const slots = new Set(takenSlots.get(key) ?? [])
    const available = Array.from(
      { length: MAX_GAMES_PER_MATCHUP },
      (_, i) => i + 1
    ).filter((num) => !taken.has(num))

    const seenInFile = new Set()

    group.forEach((row, idx) => {
      const slot = String(row.startTime ?? '').slice(0, 5)

      // Already on the schedule at this exact time.
      if (slots.has(slot)) {
        errors.push({
          row: row.rowNum,
          message: `Already scheduled — ${row.label} at ${slot || 'no start time'} is already on the schedule. Re-importing a file that has already been imported is the usual cause.`,
        })
        return
      }
      // Listed twice at the same time within this file.
      if (seenInFile.has(slot)) {
        errors.push({
          row: row.rowNum,
          message: `Duplicate row — ${row.label} appears twice at ${slot || 'no start time'} in this file.`,
        })
        return
      }
      seenInFile.add(slot)

      if (idx >= available.length) {
        errors.push({
          row: row.rowNum,
          message: `${row.label} would be game ${taken.size + idx + 1} of that matchup. The limit is ${MAX_GAMES_PER_MATCHUP} games between the same two teams on one date and field — check the date or field on this row.`,
        })
        return
      }

      row.record.game_number = available[idx]
    })
  }

  errors.sort((a, b) => a.row - b.row)

  return {
    ok: errors.length === 0,
    errors,
    rows: staged.map((s) => s.record),
    autoFinalized,
  }
}

/* -------------------------------------------------------------------------- */
/* Roster import                                                              */
/* -------------------------------------------------------------------------- */

export const ROSTER_COLUMNS = ['team', 'name', 'jersey_number']

/**
 * Validate a roster CSV against the existing teams and players.
 *
 * Jersey numbers are kept as text ("00" ≠ "0") but must look like a number, so
 * a shifted column lands as an error instead of a player called "12".
 */
export function validateRosterCsv(parsed, { teams, players }) {
  const errors = []
  const rows = []

  const headers = parsed.meta?.fields ?? []
  for (const col of ['team', 'name']) {
    if (!headers.includes(col)) {
      errors.push({ row: 1, message: `Missing required column '${col}'. Expected header: ${ROSTER_COLUMNS.join(',')}` })
    }
  }
  if (errors.length) return { ok: false, errors, rows: [] }

  const teamByName = new Map(teams.map((t) => [t.name, t]))
  const teamNames = teams.map((t) => t.name)

  // What each team already has, so a re-import doesn't silently duplicate.
  const existingNames = new Set()
  const existingJerseys = new Set()
  for (const p of players) {
    existingNames.add(`${p.team_id}|${p.name.trim().toLowerCase()}`)
    if (p.jersey_number) existingJerseys.add(`${p.team_id}|${p.jersey_number}`)
  }

  const seenNames = new Map()
  const seenJerseys = new Map()

  parsed.rows.forEach(({ data: raw, line: n }) => {
    const teamName = raw.team ?? ''
    const name = (raw.name ?? '').trim()
    const jersey = (raw.jersey_number ?? '').trim()

    if (!teamName && !name) { errors.push(leftoverRowError(n, raw)); return }

    const team = teamByName.get(teamName)
    if (!teamName) {
      errors.push({ row: n, message: 'Team is required' })
      return
    }
    if (!team) {
      errors.push(nameError(n, 'Team', teamName, teamNames))
      return
    }

    if (!name) {
      errors.push({ row: n, message: 'Player name is required' })
      return
    }

    if (jersey && !/^\d{1,3}$/.test(jersey)) {
      errors.push({
        row: n,
        message: `Jersey number '${jersey}' should be digits only (up to 3). Leave it blank if the player has no number yet.`,
      })
      return
    }

    const nameKey = `${team.id}|${name.toLowerCase()}`
    if (existingNames.has(nameKey)) {
      errors.push({
        row: n,
        message: `${name} is already on ${team.name}. Re-importing a roster that has already been imported is the usual cause — remove the rows that already exist, or edit the player in the admin panel.`,
      })
      return
    }
    if (seenNames.has(nameKey)) {
      errors.push({ row: n, message: `${name} appears twice for ${team.name} in this file (also row ${seenNames.get(nameKey)})` })
      return
    }
    seenNames.set(nameKey, n)

    if (jersey) {
      const jerseyKey = `${team.id}|${jersey}`
      if (existingJerseys.has(jerseyKey)) {
        errors.push({ row: n, message: `${team.name} already has a player wearing #${jersey}` })
        return
      }
      if (seenJerseys.has(jerseyKey)) {
        errors.push({ row: n, message: `#${jersey} is used twice for ${team.name} in this file (also row ${seenJerseys.get(jerseyKey)})` })
        return
      }
      seenJerseys.set(jerseyKey, n)
    }

    rows.push({ team_id: team.id, name, jersey_number: jersey || null })
  })

  if (!parsed.rows.length) errors.push({ row: 1, message: 'File contains no data rows — add at least one row below the header.' })

  errors.sort((a, b) => a.row - b.row)
  return { ok: errors.length === 0, errors, rows }
}

/* -------------------------------------------------------------------------- */
/* Results import — score entry via spreadsheet                               */
/* -------------------------------------------------------------------------- */

export const RESULTS_COLUMNS = [
  'game_id', 'game_date', 'start_time', 'division', 'visitor_team', 'home_team',
  'field', 'status', 'visitor_score', 'home_score',
]

/** RFC4180-ish escaping: quote anything containing a comma, quote, or newline. */
function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Trigger a browser download. Nothing leaves the machine — the file is built
 * in memory and handed to the save dialog.
 *
 * The leading BOM makes Excel open it as UTF-8; without it, Excel mangles
 * anything non-ASCII in a team name.
 */
export function downloadCsv(text, filename) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * A blank import template: the header row and nothing else.
 *
 * Deliberately NOT seeded with example rows. An admin who forgets to delete
 * them imports fake data — and because the examples use real team names, most
 * of it would validate. Worked examples are shown on screen in the import
 * dialog instead, where they can be read but not accidentally submitted.
 */
export function buildTemplateCsv(columns) {
  return columns.join(',') + '\r\n'
}

/**
 * Build the score-entry sheet for a set of games.
 *
 * game_id is the join key and must survive the round trip — everything else is
 * there so a human can find the row. Only status and the two score columns are
 * read back on import.
 */
export function buildResultsCsv(games) {
  const lines = [RESULTS_COLUMNS.join(',')]
  for (const g of games) {
    lines.push([
      g.id,
      g.game_date,
      String(g.start_time ?? '').slice(0, 5),
      g.division?.name ?? '',
      g.visitor_team?.name ?? '',
      g.home_team?.name ?? '',
      g.field?.name ?? '',
      g.status,
      g.status === STATUS.FINAL && g.visitor_score != null ? g.visitor_score : '',
      g.status === STATUS.FINAL && g.home_score != null ? g.home_score : '',
    ].map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

/**
 * Validate a filled-in results sheet against the live schedule.
 *
 * Matches on game_id only — the name columns are ignored, so renaming a team
 * between download and upload can't break the import. Rows whose status and
 * scores are unchanged are skipped rather than rewritten.
 */
export function validateResultsCsv(parsed, { games }) {
  const errors = []
  const rows = []
  let autoFinalized = 0

  const headers = parsed.meta?.fields ?? []
  for (const col of ['game_id', 'status']) {
    if (!headers.includes(col)) {
      errors.push({ row: 1, message: `Missing required column '${col}'. Re-download the sheet rather than building one by hand.` })
    }
  }
  if (errors.length) return { ok: false, errors, rows: [] }

  const gameById = new Map(games.map((g) => [g.id, g]))
  const seen = new Map()

  parsed.rows.forEach(({ data: raw, line: n }) => {
    const id = raw.game_id ?? ''

    if (!id) {
      errors.push(leftoverRowError(n, raw))
      return
    }
    const game = gameById.get(id)
    if (!game) {
      errors.push({ row: n, message: `No game found with id ${id} — it may have been deleted since you downloaded this sheet` })
      return
    }
    if (seen.has(id)) {
      errors.push({ row: n, message: `Game appears twice in this file (also row ${seen.get(id)})` })
      return
    }
    seen.set(id, n)

    const status = (raw.status ?? '').toLowerCase()
    if (!status) {
      errors.push({ row: n, message: 'Status is blank' })
      return
    }
    if (!VALID_CSV_STATUSES.has(status)) {
      errors.push({
        row: n,
        message: `Invalid status '${raw.status}' — must be one of: ${[...VALID_CSV_STATUSES].join(' · ')}`,
      })
      return
    }

    const visitorScore = parseScore(raw.visitor_score)
    const homeScore = parseScore(raw.home_score)
    if (Number.isNaN(visitorScore)) {
      errors.push({ row: n, message: `Visitor score '${raw.visitor_score}' is not a whole number` })
      return
    }
    if (Number.isNaN(homeScore)) {
      errors.push({ row: n, message: `Home score '${raw.home_score}' is not a whole number` })
      return
    }

    const label = `${raw.visitor_team || 'Visitor'} at ${raw.home_team || 'Home'}`
    const hasBoth = visitorScore != null && homeScore != null
    const hasEither = visitorScore != null || homeScore != null

    // Typing a score IS the statement that the game was played. Nobody should
    // have to also flip the status column from tbp to final by hand — that was
    // the single most annoying thing about this sheet.
    let effective = status
    if (AWAITING_RESULT.has(status)) {
      if (hasBoth) {
        effective = STATUS.FINAL
        autoFinalized++
      } else if (hasEither) {
        // Half a score is an unfinished edit, not a contradiction — say so
        // rather than falling through to the "cannot carry a score" message.
        errors.push({
          row: n,
          message: `${label} has only one score — enter both, or clear the one you entered`,
        })
        return
      }
    }

    if (effective === STATUS.FINAL && !hasBoth) {
      errors.push({
        row: n,
        message: hasEither
          ? `${label} has only one score — enter both, or clear the one you entered`
          : `${label} is marked final but has no score — enter both scores, or set status to not_reported`,
      })
      return
    }
    if (effective !== STATUS.FINAL && hasEither) {
      // Statuses where a score is genuinely contradictory, not just unstated.
      errors.push({
        row: n,
        message: `${label} is marked '${status}' but has a score. A ${status} game has no result — clear the score cells, or change the status if it was actually played.`,
      })
      return
    }

    const nextVisitor = effective === STATUS.FINAL ? visitorScore : null
    const nextHome = effective === STATUS.FINAL ? homeScore : null

    // Unchanged rows are left alone so an import only touches what was edited.
    if (
      game.status === effective &&
      (game.visitor_score ?? null) === nextVisitor &&
      (game.home_score ?? null) === nextHome
    ) return

    rows.push({ id, status: effective, visitor_score: nextVisitor, home_score: nextHome })
  })

  if (!parsed.rows.length) errors.push({ row: 1, message: 'File contains no data rows — add at least one row below the header.' })

  errors.sort((a, b) => a.row - b.row)
  return { ok: errors.length === 0, errors, rows, autoFinalized }
}

export { SCHEDULE_COLUMNS, TEAM_COLUMNS, csvCell }
