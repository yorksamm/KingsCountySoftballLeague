import styles from './Spinner.module.css'

export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.dot} />
      <span className={styles.label}>{label}</span>
    </div>
  )
}

/** Full-width error panel with an optional retry. */
export function ErrorState({ error, onRetry }) {
  const message = error?.message || String(error || 'Something went wrong.')
  return (
    <div className={styles.error} role="alert">
      <strong>Couldn’t load this page.</strong>
      <span className={styles.errorDetail}>{message}</span>
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
