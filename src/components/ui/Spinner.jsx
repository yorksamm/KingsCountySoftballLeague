import styles from './Spinner.module.css'

export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.dot} />
      <span className={styles.label}>{label}</span>
    </div>
  )
}

/**
 * Pull something readable out of whatever was thrown.
 *
 * `error.message || String(error)` is not enough: Supabase rejects with a plain
 * object, and when the server answers with an empty body that object has no
 * `message` at all — so String() rendered the literal text "[object Object]"
 * on the page. Every branch here ends in a sentence a person can act on.
 */
function describeError(error) {
  if (!error) return null
  if (typeof error === 'string') return error

  const detail =
    error.message ||
    error.error_description ||
    error.details ||
    error.hint ||
    (error.code ? `Error code ${error.code}` : null)

  return typeof detail === 'string' && detail.trim() ? detail : null
}

/** Full-width error panel with an optional retry. */
export function ErrorState({ error, onRetry }) {
  const detail = describeError(error)
  return (
    <div className={styles.error} role="alert">
      <strong>Couldn’t load this page.</strong>
      <span className={styles.errorDetail}>
        {detail
          ? detail
          : 'The league database didn’t respond. This is usually temporary — try again in a moment.'}
      </span>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

/** Neutral "nothing here" panel. */
export function EmptyState({ title, children }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {children && <span className={styles.emptyDetail}>{children}</span>}
    </div>
  )
}
