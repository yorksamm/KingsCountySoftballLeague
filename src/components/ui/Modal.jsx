import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

/**
 * Accessible dialog: Escape closes, backdrop click closes, focus moves inside
 * on open and returns to the trigger on close, and body scroll is locked.
 *
 * CAREFUL WITH THE EFFECT DEPENDENCIES HERE. Callers pass `onClose` as an
 * inline arrow, so it has a new identity on every parent render — and the
 * parent re-renders on every keystroke in a form field. If the focus effect
 * depends on `onClose`, it tears down and re-runs per keystroke, yanking focus
 * back to the first field after a single character. The onClose ref below is
 * what keeps the effect keyed on `open` alone.
 */
export default function Modal({ open, title, onClose, children, footer, width = 560 }) {
  const panelRef = useRef(null)
  const restoreFocusTo = useRef(null)

  // Always current, never a dependency.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return

    restoreFocusTo.current = document.activeElement

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.() }
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTarget = panelRef.current?.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    )
    focusTarget?.focus()

    const restoreTo = restoreFocusTo.current
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreTo?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        ref={panelRef}
        className={styles.panel}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

/** Yes/no confirmation built on the same dialog. */
export function ConfirmModal({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={440}
      footer={
        <>
          <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className={styles.message}>{message}</p>
    </Modal>
  )
}
