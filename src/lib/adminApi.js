/**
 * Admin CRUD, CSV import, and rules-PDF upload.
 *
 * Every function here is only reachable with a valid session, but that is
 * enforced by RLS in Postgres (docs Section 8.1) — not by this module and not
 * by the route guard in App.jsx. If a policy is missing, nothing in JavaScript
 * will save you.
 *
 * The referential guards below (`assertUnused`) exist to produce a readable
 * message. The database enforces the same thing with ON DELETE RESTRICT, so a
 * direct API call still cannot orphan a game row.
 */

import { supabase } from './supabase.js'
import {
  parseCsvFile, validateTeamsCsv, validateScheduleCsv,
  validateResultsCsv, buildResultsCsv, validateRosterCsv,
  downloadCsv, buildTemplateCsv,
} from './csv.js'
import { MAX_GAMES_PER_MATCHUP } from './constants.js'

function unwrap({ data, error }) {
  if (error) throw error
  return data
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    // Supabase rate-limits repeated failures. Surface that clearly rather than
    // letting it read as a wrong password (docs Section 8.6).
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      throw new Error('Too many sign-in attempts. Wait a minute and try again.')
    }
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error('Email or password is incorrect.')
    }
    if (/email not confirmed/i.test(error.message)) {
      throw new Error('This account has not been confirmed yet. Confirm it in Supabase → Authentication → Users.')
    }
    throw error
  }
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/* -------------------------------------------------------------------------- */
/* Referential guards                                                          */
/* -------------------------------------------------------------------------- */

async function countWhere(table, filters) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [col, value] of Object.entries(filters)) query = query.eq(col, value)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function countGamesReferencing(column, id) {
  return countWhere('games', { [column]: id })
}

/* -------------------------------------------------------------------------- */
/* Divisions                                                                   */
/* -------------------------------------------------------------------------- */

export async function createDivision({ name, sort_order = 0 }) {
  return unwrap(await supabase.from('divisions').insert({ name, sort_order }).select().single())
}

export async function updateDivision(id, patch) {
  return unwrap(await supabase.from('divisions').update(patch).eq('id', id).select().single())
}

export async function deleteDivision(id) {
  const teamCount = await countWhere('teams', { division_id: id })
  if (teamCount > 0) {
    throw new Error(`Cannot delete: ${teamCount} team${teamCount > 1 ? 's are' : ' is'} still assigned to this division. Reassign them first.`)
  }
  const gameCount = await countGamesReferencing('division_id', id)
  if (gameCount > 0) {
    throw new Error(`Cannot delete: ${gameCount} scheduled game${gameCount > 1 ? 's reference' : ' references'} this division.`)
  }
  const { error } = await supabase.from('divisions').delete().eq('id', id)
  if (error) throw error
}

/** Persist a new drag-and-drop order. */
export async function reorderDivisions(orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('divisions').update({ sort_order: index + 1 }).eq('id', id)
    )
  )
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                       */
/* -------------------------------------------------------------------------- */

export async function createTeam(payload) {
  return unwrap(await supabase.from('teams').insert(payload).select().single())
}

export async function updateTeam(id, patch) {
  return unwrap(await supabase.from('teams').update(patch).eq('id', id).select().single())
}

export async function deleteTeam(id) {
  const home = await countGamesReferencing('home_team_id', id)
  const away = await countGamesReferencing('visitor_team_id', id)
  const total = home + away
  if (total > 0) {
    throw new Error(
      `Cannot delete: this team has ${total} scheduled game${total > 1 ? 's' : ''}. ` +
      `If the team has withdrawn mid-season, uncheck "Active" instead — that keeps its results intact.`
    )
  }
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw error
}

/* -------------------------------------------------------------------------- */
/* Players (rosters)                                                           */
/* -------------------------------------------------------------------------- */

function friendlyPlayerError(error, name) {
  if (error?.code === '23505') {
    if (/players_team_jersey_uidx/.test(error?.message ?? '')) {
      return new Error('Another player on this team already wears that number.')
    }
    if (/players_team_name_uidx/.test(error?.message ?? '')) {
      return new Error(
        `${name || 'That player'} is already on this team. If these are two different people with the same name, add a suffix — "Mike Smith Jr".`
      )
    }
  }
  return error
}

export async function createPlayer(payload) {
  const { data, error } = await supabase.from('players').insert(payload).select().single()
  if (error) throw friendlyPlayerError(error, payload.name)
  return data
}

export async function updatePlayer(id, patch) {
  const { data, error } = await supabase.from('players').update(patch).eq('id', id).select().single()
  if (error) throw friendlyPlayerError(error, patch.name)
  return data
}

export async function deletePlayer(id) {
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw error
}

export async function importRosterCsv(file, context) {
  const parsed = await parseCsvFile(file)
  const { ok, errors, rows } = validateRosterCsv(parsed, context)
  if (!ok) return { ok: false, errors, inserted: 0 }

  const { error } = await supabase.from('players').insert(rows)
  if (error) {
    return { ok: false, errors: [{ row: 0, message: friendlyPlayerError(error).message }], inserted: 0 }
  }
  return { ok: true, errors: [], inserted: rows.length }
}

/* -------------------------------------------------------------------------- */
/* CSV templates — blank files with the headers already in place              */
/* -------------------------------------------------------------------------- */

export function downloadTemplate(columns, filename) {
  downloadCsv(buildTemplateCsv(columns), filename)
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

export async function createField(payload) {
  return unwrap(await supabase.from('fields').insert(payload).select().single())
}

export async function updateField(id, patch) {
  return unwrap(await supabase.from('fields').update(patch).eq('id', id).select().single())
}

export async function deleteField(id) {
  const count = await countGamesReferencing('field_id', id)
  if (count > 0) {
    throw new Error(`Cannot delete: ${count} scheduled game${count > 1 ? 's are' : ' is'} played here.`)
  }
  const { error } = await supabase.from('fields').delete().eq('id', id)
  if (error) throw error
}

export async function reorderFields(orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('fields').update({ sort_order: index + 1 }).eq('id', id)
    )
  )
}

/* -------------------------------------------------------------------------- */
/* Games                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which game number a new row should take within its matchup.
 *
 * A matchup can hold several games — double headers are the norm and
 * tripleheaders happen. Returns null only once MAX_GAMES_PER_MATCHUP is used
 * up, so the caller can refuse with a readable message rather than letting the
 * unique index throw.
 */
export async function nextGameNumber({ game_date, field_id, home_team_id, visitor_team_id, excludeId }) {
  let query = supabase
    .from('games')
    .select('id, game_number, home_team_id, visitor_team_id')
    .eq('game_date', game_date)
    .eq('field_id', field_id)
  if (excludeId) query = query.neq('id', excludeId)

  const rows = unwrap(await query) ?? []
  const pair = [home_team_id, visitor_team_id].sort().join('~')
  const taken = new Set(
    rows
      .filter((r) => [r.home_team_id, r.visitor_team_id].sort().join('~') === pair)
      .map((r) => r.game_number ?? 1)
  )
  for (let n = 1; n <= MAX_GAMES_PER_MATCHUP; n++) {
    if (!taken.has(n)) return n
  }
  return null
}

function friendlyGameError(error) {
  if (error?.code === '23505') {
    // Two different unique indexes can raise this — say which one.
    if (/games_matchup_slot_uidx/.test(error?.message ?? '')) {
      return new Error(
        'These two teams already have a game at that time, on that date and field. ' +
        'Change the start time, or edit the game that is already there.'
      )
    }
    return new Error(
      `That matchup already has ${MAX_GAMES_PER_MATCHUP} games on this date and field. ` +
      'Check the date and field — this looks like a duplicate.'
    )
  }
  if (error?.code === '23514' && /game_number_check/.test(error?.message ?? '')) {
    return new Error(
      `A matchup can hold at most ${MAX_GAMES_PER_MATCHUP} games on one date and field.`
    )
  }
  if (error?.code === '23514' && /final_needs_scores/.test(error?.message ?? '')) {
    return new Error('A game marked Final needs both a home and a visitor score.')
  }
  if (error?.code === '23514' && /distinct_teams/.test(error?.message ?? '')) {
    return new Error('Home and visitor cannot be the same team.')
  }
  return error
}

export async function createGame(payload) {
  const game_number = await nextGameNumber(payload)
  if (game_number == null) {
    throw new Error(
      `That matchup already has ${MAX_GAMES_PER_MATCHUP} games on this date and field.`
    )
  }
  const { data, error } = await supabase
    .from('games')
    .insert({ ...payload, game_number })
    .select()
    .single()
  if (error) throw friendlyGameError(error)
  return data
}

export async function updateGame(id, patch) {
  const { data, error } = await supabase.from('games').update(patch).eq('id', id).select().single()
  if (error) throw friendlyGameError(error)
  return data
}

export async function deleteGame(id) {
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) throw error
}

/**
 * "Save all changes" on the Game Results page — every edited row at once.
 * Docs Section 4: there is no per-row save.
 *
 * Supabase has no multi-statement transaction over PostgREST, so these run in
 * parallel and any failures are reported back together. Results editing only
 * touches status/score columns, so a partial failure leaves rows independently
 * valid — no half-written matchup.
 */
export async function saveGameResults(edits) {
  const results = await Promise.allSettled(
    edits.map(({ id, ...patch }) =>
      supabase.from('games').update(patch).eq('id', id).select('id').single()
    )
  )

  const failures = []
  results.forEach((result, i) => {
    const failed =
      result.status === 'rejected' ? result.reason :
      result.value?.error ? result.value.error : null
    if (failed) failures.push({ id: edits[i].id, error: friendlyGameError(failed) })
  })

  return { saved: edits.length - failures.length, failures }
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                               */
/* -------------------------------------------------------------------------- */

export async function createAnnouncement(payload) {
  return unwrap(await supabase.from('announcements').insert(payload).select().single())
}

export async function updateAnnouncement(id, patch) {
  return unwrap(await supabase.from('announcements').update(patch).eq('id', id).select().single())
}

export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}

/** Admins can read inactive announcements; the public cannot. */
export async function getAllAnnouncements() {
  return unwrap(
    await supabase
      .from('announcements')
      .select('id, title, body, active, pinned, created_at, updated_at')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
  ) ?? []
}

/* -------------------------------------------------------------------------- */
/* Rules PDF                                                                   */
/* -------------------------------------------------------------------------- */

export const RULES_MAX_BYTES = 20 * 1024 * 1024   // 20MB, mirrored by the bucket policy

export async function uploadRulesPdf(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files can be uploaded.')
  }
  if (file.size > RULES_MAX_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 20MB.`)
  }

  // Cache-busting path so a replacement is served immediately rather than from
  // a stale CDN copy of the previous file.
  const path = `league-rules-${Date.now()}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('rules')
    .upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage.from('rules').getPublicUrl(path)

  const previous = unwrap(
    await supabase.from('rules_document').select('file_path').eq('id', 1).maybeSingle()
  )

  const saved = unwrap(
    await supabase
      .from('rules_document')
      .update({ file_path: path, public_url: urlData.publicUrl, file_name: file.name })
      .eq('id', 1)
      .select()
      .single()
  )

  // Only one active rules PDF at a time (docs Section 4) — drop the old object
  // once the pointer has moved. A failure here is cosmetic, not a data problem.
  if (previous?.file_path && previous.file_path !== path) {
    await supabase.storage.from('rules').remove([previous.file_path]).catch(() => {})
  }

  return saved
}

export async function clearRulesPdf() {
  const previous = unwrap(
    await supabase.from('rules_document').select('file_path').eq('id', 1).maybeSingle()
  )
  const saved = unwrap(
    await supabase
      .from('rules_document')
      .update({ file_path: null, public_url: null, file_name: null })
      .eq('id', 1)
      .select()
      .single()
  )
  if (previous?.file_path) {
    await supabase.storage.from('rules').remove([previous.file_path]).catch(() => {})
  }
  return saved
}

/* -------------------------------------------------------------------------- */
/* CSV import — validate everything, then write once                           */
/* -------------------------------------------------------------------------- */

/**
 * @returns {{ ok:boolean, errors:object[], inserted:number }}
 * On ok:false nothing at all has been written.
 */
export async function importTeamsCsv(file, context) {
  const parsed = await parseCsvFile(file)
  const { ok, errors, rows } = validateTeamsCsv(parsed, context)
  if (!ok) return { ok: false, errors, inserted: 0 }

  // One statement = one implicit transaction. Either every row lands or none do.
  const { error } = await supabase.from('teams').insert(rows)
  if (error) return { ok: false, errors: [{ row: 0, message: error.message }], inserted: 0 }

  return { ok: true, errors: [], inserted: rows.length }
}

/**
 * Download the currently-listed games as a score-entry sheet.
 * Opens the browser's save dialog; nothing leaves the machine.
 */
export function downloadResultsCsv(games, filename = 'kcsl-results.csv') {
  // BOM so Excel opens it as UTF-8 rather than mangling team names.
  const blob = new Blob(['﻿' + buildResultsCsv(games)], {
    type: 'text/csv;charset=utf-8;',
  })
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
 * Apply a filled-in score sheet. Validates every row first; if any row fails,
 * nothing is written.
 */
export async function importResultsCsv(file, context) {
  const parsed = await parseCsvFile(file)
  const { ok, errors, rows, autoFinalized } = validateResultsCsv(parsed, context)
  if (!ok) return { ok: false, errors, inserted: 0 }

  if (rows.length === 0) {
    return { ok: true, errors: [], inserted: 0, unchanged: true }
  }

  const { saved, failures } = await saveGameResults(rows)
  if (failures.length) {
    return {
      ok: false,
      errors: failures.map((f) => ({ row: 0, message: f.error.message })),
      inserted: saved,
    }
  }
  return { ok: true, errors: [], inserted: saved, autoFinalized, verb: 'Updated' }
}

export async function importScheduleCsv(file, context) {
  const parsed = await parseCsvFile(file)
  const { ok, errors, rows, autoFinalized } = validateScheduleCsv(parsed, context)
  if (!ok) return { ok: false, errors, inserted: 0 }

  const { error } = await supabase.from('games').insert(rows)
  if (error) {
    const friendly = friendlyGameError(error)
    return { ok: false, errors: [{ row: 0, message: friendly.message }], inserted: 0 }
  }

  return { ok: true, errors: [], inserted: rows.length, autoFinalized }
}
