import { STATUS_META, RESULT_META } from '../../lib/constants.js'
import styles from './Badge.module.css'

/**
 * Status chip. Shows the short code from the schedule key (F, TBP, FFT-L …)
 * with the full name as a tooltip.
 */
export function StatusBadge({ status, className = '' }) {
  const meta = STATUS_META[status]
  if (!meta) return null
  return (
    <span
      className={[styles.badge, styles[meta.tone], className].filter(Boolean).join(' ')}
      title={`${meta.name} — ${meta.description}`}
    >
      {meta.code}
    </span>
  )
}

/**
 * Derived W / L / T chip. On a game card this reads from the HOME team's point
 * of view, so `title` is passed in to say so explicitly rather than leaving a
 * bare "Win" that doesn't state whose.
 */
export function ResultBadge({ result, title, className = '' }) {
  const meta = RESULT_META[result]
  if (!meta) return null
  return (
    <span
      className={[styles.badge, styles.result, styles[meta.tone], className].filter(Boolean).join(' ')}
      title={title ?? meta.name}
    >
      {meta.code}
    </span>
  )
}

export function Badge({ tone = 'neutral', children, className = '', ...rest }) {
  return (
    <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  )
}
