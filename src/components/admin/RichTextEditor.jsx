import { useRef, useState } from 'react'
import RichText from '../../lib/richText.jsx'
import styles from './RichTextEditor.module.css'

/**
 * Textarea plus formatting buttons and a live preview.
 *
 * The buttons exist because the people writing these notices are league
 * volunteers, not markdown users. Nobody should have to know that `##` makes a
 * heading — they select some text, press **Heading**, and see the result
 * underneath. The syntax is still there for anyone who wants to type it.
 */

/** Wraps the selection, or inserts placeholder text if nothing is selected. */
function wrapSelection(el, before, after, placeholder) {
  const start = el.selectionStart
  const end = el.selectionEnd
  const selected = el.value.slice(start, end) || placeholder
  const next = el.value.slice(0, start) + before + selected + after + el.value.slice(end)
  return { next, cursor: [start + before.length, start + before.length + selected.length] }
}

/** Adds a prefix to the start of every selected line (headings, lists). */
function prefixLines(el, prefix, placeholder) {
  const value = el.value
  const start = el.selectionStart
  const end = el.selectionEnd

  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end)

  const block = value.slice(lineStart, lineEnd) || placeholder
  const prefixed = block
    .split('\n')
    .map((line, i) => {
      // Numbered lists count up; everything else repeats the same marker.
      const mark = prefix === '1. ' ? `${i + 1}. ` : prefix
      return line.startsWith(mark) ? line : mark + line
    })
    .join('\n')

  // A heading or list needs a blank line above it to start a new block.
  const needsGap = lineStart > 0 && value[lineStart - 1] !== '\n'
  const gap = needsGap ? '\n' : ''

  const next = value.slice(0, lineStart) + gap + prefixed + value.slice(lineEnd)
  const from = lineStart + gap.length
  return { next, cursor: [from, from + prefixed.length] }
}

export default function RichTextEditor({ value, onChange, id, placeholder }) {
  const ref = useRef(null)
  const [showHelp, setShowHelp] = useState(false)

  const apply = (fn) => {
    const el = ref.current
    if (!el) return
    const { next, cursor } = fn(el)
    onChange(next)
    // Restore the selection after React re-renders the textarea.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(cursor[0], cursor[1])
    })
  }

  const TOOLS = [
    { label: 'Heading',   title: 'Big heading',      run: (el) => prefixLines(el, '# ', 'Heading') },
    { label: 'Subhead',   title: 'Smaller heading',  run: (el) => prefixLines(el, '## ', 'Subheading') },
    { label: 'B',         title: 'Bold',   className: styles.bold,   run: (el) => wrapSelection(el, '**', '**', 'bold text') },
    { label: 'I',         title: 'Italic', className: styles.italic, run: (el) => wrapSelection(el, '*', '*', 'italic text') },
    { label: '• List',    title: 'Bulleted list',    run: (el) => prefixLines(el, '- ', 'List item') },
    { label: '1. List',   title: 'Numbered list',    run: (el) => prefixLines(el, '1. ', 'First item') },
    { label: 'Link',      title: 'Link',             run: (el) => wrapSelection(el, '[', '](https://)', 'link text') },
    { label: '— Divider', title: 'Horizontal divider', run: (el) => prefixLines(el, '', '\n---\n') },
  ]

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar} role="toolbar" aria-label="Text formatting">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            className={[styles.tool, tool.className].filter(Boolean).join(' ')}
            // Keeps the textarea selection alive when the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(tool.run)}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.helpToggle}
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
        >
          {showHelp ? 'Hide' : 'Formatting help'}
        </button>
      </div>

      {showHelp && (
        <dl className={styles.help}>
          <div><dt># Heading</dt><dd>A big heading on its own line</dd></div>
          <div><dt>## Subheading</dt><dd>A smaller heading</dd></div>
          <div><dt>**bold**</dt><dd>Bold text</dd></div>
          <div><dt>*italic*</dt><dd>Italic text</dd></div>
          <div><dt>- item</dt><dd>A bullet point</dd></div>
          <div><dt>1. item</dt><dd>A numbered point</dd></div>
          <div><dt>[Rules](https://…)</dt><dd>A link</dd></div>
          <div><dt>---</dt><dd>A divider line</dd></div>
          <div><dt>(blank line)</dt><dd>Starts a new paragraph</dd></div>
        </dl>
      )}

      <textarea
        id={id}
        ref={ref}
        className={styles.textarea}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
      />

      <div className={styles.previewWrap}>
        <span className={styles.previewLabel}>Preview — how this will look on the home page</span>
        <div className={styles.preview}>
          {value.trim()
            ? <RichText text={value} />
            : <p className={styles.previewEmpty}>Nothing to preview yet.</p>}
        </div>
      </div>
    </div>
  )
}
