import { useCallback, useEffect, useRef, useState } from 'react'
import { TEXT_COLORS } from '../../lib/richText.jsx'
import { domToDoc, docToDom, COLOR_TO_HEX, isEmptyDoc } from '../../lib/richDoc.jsx'
import styles from './RichTextEditor.module.css'

/**
 * WYSIWYG editor for announcements. What the admin sees in the box is what the
 * home page publishes — no markers, no preview pane to compare against.
 *
 * WHY execCommand, given it's deprecated: toggling is the whole point of this
 * rewrite. Pressing Bold on already-bold text has to UNBOLD it, and doing that
 * by hand means reimplementing selection splitting, partial-selection state,
 * undo integration and Cmd+B — badly. execCommand gets all of that from the
 * browser, works everywhere today, and has no announced removal date. The
 * output is messy, but nothing about that matters because we never store its
 * HTML: domToDoc() reduces the DOM to a restricted JSON document on every
 * change, which is also what keeps a pasted <script> from ever being saved.
 */

const BLOCK_TAG = { p: 'P', h1: 'H3', h2: 'H4' }

export default function RichTextEditor({ value, onChange, id, placeholder }) {
  const ref = useRef(null)
  const [active, setActive] = useState({})
  // Set while we're writing the caller's value in, so the resulting DOM
  // mutations don't echo straight back out as a change.
  const loading = useRef(false)
  // The doc we last emitted, to avoid clobbering the caret by reloading our
  // own output on the next render.
  const lastEmitted = useRef(null)

  /* --- load the document into the box ------------------------------------ */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (lastEmitted.current && JSON.stringify(value) === lastEmitted.current) return

    loading.current = true
    el.replaceChildren(docToDom(value, document))
    loading.current = false
  }, [value])

  /* --- read the box back out --------------------------------------------- */
  const emit = useCallback(() => {
    const el = ref.current
    if (!el || loading.current) return
    const doc = domToDoc(el)
    lastEmitted.current = JSON.stringify(doc)
    onChange(doc)
  }, [onChange])

  /* --- which buttons should look pressed --------------------------------- */
  const refreshActive = useCallback(() => {
    const el = ref.current
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return
    const q = (cmd) => { try { return document.queryCommandState(cmd) } catch { return false } }
    let block = ''
    try { block = (document.queryCommandValue('formatBlock') || '').toUpperCase() } catch { /* unsupported */ }
    setActive({
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      ul: q('insertUnorderedList'),
      ol: q('insertOrderedList'),
      h1: block === 'H3',
      h2: block === 'H4',
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive)
    return () => document.removeEventListener('selectionchange', refreshActive)
  }, [refreshActive])

  /* --- commands ----------------------------------------------------------- */
  const run = (cmd, arg) => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Inline styles rather than <font> tags — easier to read back reliably.
    try { document.execCommand('styleWithCSS', false, true) } catch { /* older engines */ }
    document.execCommand(cmd, false, arg)
    emit()
    refreshActive()
  }

  const toggleBlock = (type) => {
    const isOn = active[type]
    run('formatBlock', isOn ? 'P' : BLOCK_TAG[type])
  }

  /**
   * Paste as plain text. Keeps pasted Word/webpage markup — and anything
   * hostile in it — out of the box entirely, rather than relying on domToDoc
   * to strip it afterwards.
   */
  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    emit()
  }

  const showPlaceholder = isEmptyDoc(value)

  const Btn = ({ cmd, label, title, className, on }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={Boolean(on)}
      className={[styles.tool, className, on ? styles.toolOn : ''].filter(Boolean).join(' ')}
      onMouseDown={(e) => e.preventDefault()}   // keep the selection alive
      onClick={cmd}
    >
      {label}
    </button>
  )

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} role="toolbar" aria-label="Text formatting">
        <Btn title="Big heading" label="Heading" on={active.h1} cmd={() => toggleBlock('h1')} />
        <Btn title="Smaller heading" label="Subhead" on={active.h2} cmd={() => toggleBlock('h2')} />

        <Btn title="Bold" label="B" className={styles.bold} on={active.bold} cmd={() => run('bold')} />
        <Btn title="Italic" label="I" className={styles.italic} on={active.italic} cmd={() => run('italic')} />
        <Btn title="Underline" label="U" className={styles.underlineBtn} on={active.underline} cmd={() => run('underline')} />

        <Btn title="Bulleted list" label="• List" on={active.ul} cmd={() => run('insertUnorderedList')} />
        <Btn title="Numbered list" label="1. List" on={active.ol} cmd={() => run('insertOrderedList')} />

        <Btn
          title="Add a link"
          label="Link"
          cmd={() => {
            const url = window.prompt('Link address (https://…)')
            if (url) run('createLink', url)
          }}
        />
        <Btn title="Remove link" label="Unlink" cmd={() => run('unlink')} />

        <span className={styles.swatches} role="group" aria-label="Text colour">
          {Object.entries(TEXT_COLORS).map(([name, meta]) => (
            <button
              key={name}
              type="button"
              title={`${meta.label} — ${meta.hint}`}
              aria-label={`Colour text ${meta.label}`}
              className={`${styles.swatch} ${styles[`sw_${name}`]}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run('foreColor', COLOR_TO_HEX[name])}
            />
          ))}
          <button
            type="button"
            title="Back to normal text colour"
            aria-label="Remove colour"
            className={`${styles.swatch} ${styles.swatchNone}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run('foreColor', '#16202b')}
          />
        </span>

        <span className={styles.spacer} />
        <Btn title="Undo" label="↶" cmd={() => run('undo')} />
        <Btn title="Redo" label="↷" cmd={() => run('redo')} />
      </div>

      <div className={styles.surfaceWrap}>
        {showPlaceholder && placeholder && (
          <div className={styles.placeholder} aria-hidden="true">{placeholder}</div>
        )}
        <div
          id={id}
          ref={ref}
          className={styles.surface}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Announcement body"
          onInput={emit}
          onBlur={emit}
          onPaste={onPaste}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
        />
      </div>

      <p className={styles.footNote}>
        This is exactly how the announcement will look on the home page.
      </p>
    </div>
  )
}
