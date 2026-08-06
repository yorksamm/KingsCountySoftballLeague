import styles from './AdminPageHeader.module.css'

export default function AdminPageHeader({ title, description, children }) {
  return (
    <header className={styles.head}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  )
}

/** Inline success / error strip used across the admin pages. */
export function Notice({ tone = 'info', children, onDismiss }) {
  if (!children) return null
  return (
    <div className={[styles.notice, styles[tone]].join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className={styles.noticeClose}>×</button>
      )}
    </div>
  )
}
