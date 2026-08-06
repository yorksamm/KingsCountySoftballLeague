import { useState } from 'react'
import { STATUS_META, STATUS_ORDER, RESULT_META } from '../../lib/constants.js'
import styles from './ScheduleKey.module.css'

/** The schedule key from docs Section 3, collapsible so it doesn't crowd the page. */
export default function ScheduleKey({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={styles.key}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.toggleLabel}>Schedule key</span>
        <span className={styles.hint}>All scores are Visitor – Home</span>
        <span className={styles.chevron} aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <dl className={styles.list}>
            {STATUS_ORDER.map((status) => {
              const meta = STATUS_META[status]
              return (
                <div key={status} className={styles.item}>
                  <dt className={[styles.code, styles[meta.tone]].join(' ')}>{meta.code}</dt>
                  <dd className={styles.text}>
                    <strong>{meta.name}</strong>
                    <span>{meta.description}</span>
                  </dd>
                </div>
              )
            })}

            {Object.values(RESULT_META).map((meta) => (
              <div key={meta.code} className={styles.item}>
                <dt className={[styles.code, styles[meta.tone]].join(' ')}>{meta.code}</dt>
                <dd className={styles.text}>
                  <strong>{meta.name}</strong>
                  <span>Shown next to the game status, from the HOME team's point of view. Derived from the score, never entered.</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}
