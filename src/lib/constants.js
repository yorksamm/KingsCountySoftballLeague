/**
 * Status vocabulary — docs Section 3 (Schedule Key) and Section 5 (CSV values).
 *
 * The DB stores the snake_case value; the public site shows the short code;
 * the admin panel shows an unambiguous long label.
 */

export const STATUS = {
  TBP: 'tbp',
  FINAL: 'final',
  NOT_REPORTED: 'not_reported',
  CANCELLED: 'cancelled',
  POSTPONED: 'postponed',
  SUSPENDED: 'suspended',
  FORFEIT: 'forfeit',
  FORFEIT_LOSS: 'forfeit_loss',
  FORFEIT_WIN: 'forfeit_win',
}

export const STATUS_META = {
  [STATUS.FINAL]: {
    code: 'F',
    name: 'Final',
    // Long label used in admin dropdowns. forfeit_loss / forfeit_win are named
    // relative to the HOME team in the spec, which is easy to get backwards, so
    // the admin UI never shows the raw value.
    adminLabel: 'Final — score entered',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Final',
    description: 'Game is complete. Score shown as Visitor – Home.',
    tone: 'final',
  },
  [STATUS.TBP]: {
    code: 'TBP',
    name: 'To Be Played',
    adminLabel: 'To Be Played',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'To Be Played',
    description: 'Game has not yet occurred.',
    tone: 'neutral',
  },
  [STATUS.NOT_REPORTED]: {
    code: 'N/R',
    name: 'Score Not Reported',
    adminLabel: 'Played — score not reported',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Score not reported',
    description: 'Game was played but the score has not been entered yet.',
    tone: 'warn',
  },
  [STATUS.CANCELLED]: {
    code: 'CAN',
    name: 'Cancelled',
    adminLabel: 'Cancelled',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Cancelled',
    description: 'Game will not be played.',
    tone: 'dead',
  },
  [STATUS.POSTPONED]: {
    code: 'PPD',
    name: 'Postponed',
    adminLabel: 'Postponed',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Postponed',
    description: 'Game is rescheduled; new date to be announced.',
    tone: 'dead',
  },
  [STATUS.SUSPENDED]: {
    code: 'SPD',
    name: 'Suspended',
    adminLabel: 'Suspended',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Suspended',
    description: 'Game was stopped and will be resumed at a later date.',
    tone: 'dead',
  },
  [STATUS.FORFEIT]: {
    code: 'FFT',
    name: 'Forfeit (unresolved)',
    adminLabel: 'Forfeit — pending league review',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Forfeit — under review',
    description: 'A forfeit occurred; result pending league review. Does not yet count toward standings.',
    tone: 'warn',
  },
  [STATUS.FORFEIT_LOSS]: {
    code: 'FFT-L',
    name: 'Forfeit Loss',
    adminLabel: 'Forfeit — HOME team forfeited (home L, visitor W)',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Forfeit — home forfeited',
    description: 'The forfeiting team is issued a loss.',
    tone: 'forfeit',
  },
  [STATUS.FORFEIT_WIN]: {
    code: 'FFT-W',
    name: 'Forfeit Win',
    adminLabel: 'Forfeit — VISITOR team forfeited (visitor L, home W)',
    // Shorter form for the Game Results table, where the column is narrow.
    tableLabel: 'Forfeit — visitor forfeited',
    description: 'The opposing team is awarded a win.',
    tone: 'forfeit',
  },
}

/** Order shown in the schedule key and in admin dropdowns. */
export const STATUS_ORDER = [
  STATUS.FINAL,
  STATUS.TBP,
  STATUS.NOT_REPORTED,
  STATUS.CANCELLED,
  STATUS.POSTPONED,
  STATUS.SUSPENDED,
  STATUS.FORFEIT,
  STATUS.FORFEIT_LOSS,
  STATUS.FORFEIT_WIN,
]

/**
 * Derived result codes — never entered, only computed. Docs Section 3.
 * Shown beside every decided game's score, not just on a team-filtered view.
 */
export const RESULT_META = {
  W: { code: 'W', name: 'Win', tone: 'win' },
  L: { code: 'L', name: 'Loss', tone: 'loss' },
  T: { code: 'T', name: 'Tie', tone: 'tie' },
}

/** Statuses that contribute to Won / Lost / Tied / Games Played. Docs Section 7. */
export const STANDINGS_COUNTED = new Set([
  STATUS.FINAL,
  STATUS.FORFEIT_LOSS,
  STATUS.FORFEIT_WIN,
])

/**
 * Statuses whose runs feed RF / RA / RD.
 * Only `final` — a resolved forfeit counts toward W/L but its score is NOT
 * applied to run differential for either team (docs Section 6).
 */
export const RUNS_COUNTED = new Set([STATUS.FINAL])

export const VALID_CSV_STATUSES = new Set(Object.values(STATUS))

/**
 * Statuses that mean "this game is waiting for a result".
 *
 * Entering a score on one of these isn't a contradiction — it IS the result
 * arriving — so the game is promoted to `final` automatically rather than
 * rejected. Every other non-final status (cancelled, postponed, suspended, the
 * forfeits) genuinely conflicts with a score and still errors.
 */
export const AWAITING_RESULT = new Set([STATUS.TBP, STATUS.NOT_REPORTED])

/**
 * Loose sanity bound on how many games one matchup (date + field + team pair)
 * may hold. Docs v3.0 Section 4 says two; real KCSL data has tripleheaders.
 *
 * THIS IS NOT THE DUPLICATE RULE. The duplicate rule is: the same two teams may
 * play any number of games on one date and field, but never two at the same
 * start time. That's enforced by games_matchup_slot_uidx in the database and by
 * validateScheduleCsv on import.
 *
 * Must stay in step with the `games_game_number_check` constraint in
 * supabase_schema.sql.
 */
export const MAX_GAMES_PER_MATCHUP = 9

// `?? {}` so this module can also be imported by plain Node (the standings
// self-check script), where import.meta.env doesn't exist.
const env = import.meta.env ?? {}

export const LEAGUE = {
  name: env.VITE_LEAGUE_NAME || 'Kings County Softball League',
  short: env.VITE_LEAGUE_SHORT || 'KCSL',
  email: env.VITE_CONTACT_EMAIL || '',
}
