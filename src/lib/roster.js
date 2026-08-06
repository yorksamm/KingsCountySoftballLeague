/**
 * Roster helpers.
 *
 * Jersey numbers are stored as text so "00" survives, which means sorting them
 * as strings would put 10 before 2. These compare numerically when both parse,
 * fall back to a string compare when they don't, and push unnumbered players to
 * the end where a reader expects them.
 */

export function byJersey(a, b) {
  const na = a?.jersey_number
  const nb = b?.jersey_number

  if (!na && !nb) return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
  if (!na) return 1
  if (!nb) return -1

  const ia = Number(na)
  const ib = Number(nb)
  if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib

  // Same numeric value ("0" vs "00") or non-numeric: keep it stable by text.
  return String(na).localeCompare(String(nb)) ||
         String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
}

/** Group players by team_id, each list sorted by jersey number. */
export function rosterByTeam(players) {
  const map = new Map()
  for (const player of players ?? []) {
    if (!map.has(player.team_id)) map.set(player.team_id, [])
    map.get(player.team_id).push(player)
  }
  for (const list of map.values()) list.sort(byJersey)
  return map
}
