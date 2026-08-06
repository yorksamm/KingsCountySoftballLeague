/**
 * Date / time / number formatting.
 *
 * IMPORTANT (docs Section 8.5): game_date arrives as a plain 'YYYY-MM-DD'
 * string and start_time as 'HH:MM:SS'. We NEVER hand either to `new Date(str)`
 * with a bare date, because JS parses 'YYYY-MM-DD' as UTC midnight and then
 * renders it in local time — which shows a Sunday game on Saturday for anyone
 * west of Greenwich. Every helper here parses the parts by hand.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM-DD' -> a local-midnight Date. Safe for weekday math only. */
export function parseLocalDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** 'YYYY-MM-DD' -> 'Sun, Apr 12' */
export function formatDate(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return ''
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** 'YYYY-MM-DD' -> 'Sunday, April 12, 2026' */
export function formatDateLong(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return ''
  const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
  return `${full[d.getDay()]}, ${fullMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** 'Sun' */
export function formatDay(dateStr) {
  const d = parseLocalDate(dateStr)
  return d ? DAYS[d.getDay()] : ''
}

/** '09:00:00' -> '9:00 am' */
export function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hRaw, mRaw] = String(timeStr).split(':')
  let h = Number(hRaw)
  const m = mRaw ?? '00'
  if (Number.isNaN(h)) return ''
  const suffix = h >= 12 ? 'pm' : 'am'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${suffix}`
}

/** '09:00:00' -> '09:00' (for <input type="time"> and CSV export) */
export function toTimeInput(timeStr) {
  if (!timeStr) return ''
  return String(timeStr).slice(0, 5)
}

/** Today as 'YYYY-MM-DD' in LOCAL time — not toISOString(), which is UTC. */
export function todayLocalISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 0.6667 -> '.667'  |  1 -> '1.000'  |  0 -> '.000' */
export function formatPct(value) {
  if (value == null || Number.isNaN(value)) return '.000'
  const fixed = value.toFixed(3)
  return fixed.startsWith('0') ? fixed.slice(1) : fixed
}

/** Games behind: 0 renders as an em dash, halves as '1.5'. */
export function formatGB(value) {
  if (value == null || Number.isNaN(value)) return '—'
  if (value <= 0) return '—'
  return value % 1 === 0 ? String(value) : value.toFixed(1)
}

/** Run differential with an explicit sign. */
export function formatRD(value) {
  if (value == null || Number.isNaN(value)) return '0'
  return value > 0 ? `+${value}` : String(value)
}
