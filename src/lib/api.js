/**
 * Public, read-only data access.
 *
 * Everything here is reachable by an anonymous visitor. The RLS policies in
 * supabase_schema.sql are what actually decide that — these functions just ask
 * for what the public site needs.
 */

import { supabase } from './supabase.js'
import { todayLocalISO } from './format.js'

/** Shared select for games with their related rows joined. */
const GAME_SELECT = `
  id, game_date, start_time, game_number, status,
  home_score, visitor_score, notes,
  division_id, home_team_id, visitor_team_id, field_id,
  division:divisions ( id, name, sort_order ),
  home_team:teams!games_home_team_id_fkey ( id, name, is_active ),
  visitor_team:teams!games_visitor_team_id_fkey ( id, name, is_active ),
  field:fields ( id, name, address, map_url, notes )
`

function unwrap({ data, error }) {
  if (error) throw error
  return data ?? []
}

export async function getDivisions() {
  return unwrap(
    await supabase
      .from('divisions')
      .select('id, name, sort_order')
      .order('sort_order')
      .order('name')
  )
}

export async function getTeams() {
  return unwrap(
    await supabase
      .from('teams')
      .select('id, name, division_id, contact_name, contact_email, is_active, division:divisions ( id, name, sort_order )')
      .order('name')
  )
}

/**
 * Every player in the league. Small enough (a few hundred rows) to fetch once
 * and slice client-side for the per-team rosters and the all-players list.
 */
export async function getPlayers() {
  return unwrap(
    await supabase
      .from('players')
      .select('id, team_id, name, jersey_number, team:teams ( id, name, division_id, is_active )')
      .order('name')
  )
}

export async function getFields() {
  return unwrap(
    await supabase
      .from('fields')
      .select('id, name, address, map_url, notes, sort_order')
      .order('sort_order')
      .order('name')
  )
}

/** Every game, oldest first. The season is small enough to hold in memory. */
export async function getGames() {
  return unwrap(
    await supabase
      .from('games')
      .select(GAME_SELECT)
      .order('game_date')
      .order('start_time', { nullsFirst: true })
      .order('game_number')
  )
}

/**
 * Games on or after today, soonest first.
 * Compared against a LOCAL date string, not UTC — docs Section 8.5.
 */
export async function getUpcomingGames(limit = 40) {
  return unwrap(
    await supabase
      .from('games')
      .select(GAME_SELECT)
      .gte('game_date', todayLocalISO())
      .order('game_date')
      .order('start_time', { nullsFirst: true })
      .order('game_number')
      .limit(limit)
  )
}

/**
 * Active announcements only.
 *
 * The `.eq('active', true)` here is belt-and-braces: the anon RLS policy
 * already makes inactive rows unreadable to the public. It matters when an
 * admin is logged in — their session CAN read inactive rows, and the public
 * banner should still not show them.
 */
export async function getActiveAnnouncements() {
  return unwrap(
    await supabase
      .from('announcements')
      .select('id, title, body, body_doc, active, pinned, created_at')
      .eq('active', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
  )
}

export async function getRulesDocument() {
  const { data, error } = await supabase
    .from('rules_document')
    .select('id, file_path, public_url, file_name, updated_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data
}
