/**
 * The colours an announcement author can use.
 *
 * A FIXED PALETTE, not a colour picker. League notices are the one place on the
 * site where text absolutely has to stay readable, and a free picker invites
 * pale yellow on white.
 *
 * WHY THESE EXACT VALUES: contrast of coloured text sitting on a highlight is
 * simply its contrast against white divided by the highlight's. So the whole
 * grid is safe if
 *
 *     min(text contrast) / max(highlight contrast)  >=  4.5
 *
 * Here that is 6.47 / 1.186 = 5.46:1, so EVERY one of the 11 x 7 combinations
 * clears WCAG AA, and every text colour clears AA on plain white too (worst is
 * orange at 6.47:1). Changing any value means re-checking that ratio — the
 * earlier five-colour palette failed once highlights were added, at orange on
 * pink, 3.85:1.
 */

/** Text colours. Key is what gets stored in the document. */
export const TEXT_COLORS = {
  red:    { label: 'Red',    hex: '#b02121', hint: 'Cancellations, deadlines' },
  rose:   { label: 'Rose',   hex: '#a01050', hint: 'Urgent notices' },
  orange: { label: 'Orange', hex: '#9c440c', hint: 'League accent color' },
  brown:  { label: 'Brown',  hex: '#7b4b2a', hint: 'Field and venue notes' },
  green:  { label: 'Green',  hex: '#166534', hint: 'Confirmations, good news' },
  teal:   { label: 'Teal',   hex: '#00625a', hint: 'Schedule changes' },
  blue:   { label: 'Blue',   hex: '#0f4c96', hint: 'General information' },
  indigo: { label: 'Indigo', hex: '#3730a3', hint: 'Playoffs, postseason' },
  purple: { label: 'Purple', hex: '#6a1b9a', hint: 'Awards, milestones' },
  navy:   { label: 'Navy',   hex: '#0d2440', hint: 'Headings, strong emphasis' },
  gray:   { label: 'Gray',   hex: '#465463', hint: 'De-emphasised, fine print' },
}

/**
 * Highlight (background) colours. These are what actually make a notice pop —
 * far more than coloured text alone — which is why they're deliberately pale:
 * every text colour has to stay legible on top of them.
 */
export const HIGHLIGHTS = {
  yellow: { label: 'Yellow', hex: '#fff7c2', hint: 'Read this first' },
  green:  { label: 'Green',  hex: '#ddf6e5', hint: 'Confirmed' },
  blue:   { label: 'Blue',   hex: '#e4f1fd', hint: 'Information' },
  pink:   { label: 'Pink',   hex: '#fde7f0', hint: 'Attention' },
  orange: { label: 'Orange', hex: '#ffeeda', hint: 'Changes' },
  purple: { label: 'Purple', hex: '#f2e8fb', hint: 'Special events' },
}

/** Default body colour — used by the "remove colour" button. */
export const DEFAULT_INK = '#16202b'

export const TEXT_COLOR_NAMES = Object.keys(TEXT_COLORS)
export const HIGHLIGHT_NAMES = Object.keys(HIGHLIGHTS)

const norm = (v) => String(v ?? '').trim().toLowerCase()

/** 'rgb(176, 33, 33)' or '#B02121' -> 'red'. Unrecognised values return null. */
function toName(value, table) {
  if (!value) return null
  let hex = norm(value)
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(hex)
  if (rgb) {
    hex = '#' + [1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')
  }
  for (const [name, meta] of Object.entries(table)) {
    if (norm(meta.hex) === hex) return name
  }
  return null
}

export const textColorName = (value) => toName(value, TEXT_COLORS)
export const highlightName = (value) => toName(value, HIGHLIGHTS)
