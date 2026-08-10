import { Fragment } from 'react'
import { parseBlocks, parseInlineRuns, TEXT_COLORS } from './richText.jsx'
import styles from './richText.module.css'

/**
 * Structured document model for announcements.
 *
 * WHY JSON AND NOT HTML: the editor is a contenteditable box, and the obvious
 * thing to store would be its innerHTML. That would force
 * dangerouslySetInnerHTML on the public page, which docs §8.3 rules out — the
 * admin session token lives in localStorage and announcements are the one place
 * a human types content everyone else reads. So the editor's DOM is walked and
 * reduced to this restricted shape on save, and rendered back to React
 * elements on display. No HTML string exists at any point, which means there is
 * nothing to sanitise and nothing that can smuggle a tag through.
 *
 * Shape:
 *   { v: 1, blocks: [ Block ] }
 *
 *   Block = { type: 'p'|'h1'|'h2'|'hr', runs: [Run] }
 *         | { type: 'ul'|'ol', items: [[Run]] }
 *
 *   Run   = { text, b?, i?, u?, c?, href? }
 *
 * Marks are flat per run rather than a nested tree. Bold-inside-colour and
 * colour-inside-bold collapse to the same run, which is exactly right — the
 * ordering was meaningless and was the source of the old nesting bugs.
 */

export const DOC_VERSION = 1

const BLOCK_TYPES = new Set(['p', 'h1', 'h2', 'hr', 'ul', 'ol'])
const SAFE_PROTOCOL = /^(https?:|mailto:)/i

function safeHref(raw) {
  const href = String(raw ?? '').trim()
  if (!href) return null
  if (SAFE_PROTOCOL.test(href)) return href
  if (href.startsWith('/')) return href
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(href)) return `https://${href}`
  return null
}

/** Keep only known marks, and only palette colours. */
function cleanRun(run) {
  if (!run || typeof run.text !== 'string' || run.text === '') return null
  const out = { text: run.text }
  if (run.b) out.b = true
  if (run.i) out.i = true
  if (run.u) out.u = true
  if (run.c && Object.hasOwn(TEXT_COLORS, run.c)) out.c = run.c
  const href = run.href ? safeHref(run.href) : null
  if (href) out.href = href
  return out
}

const sameMarks = (a, b) =>
  a.b === b.b && a.i === b.i && a.u === b.u && a.c === b.c && a.href === b.href

/** Merge adjacent runs that share formatting, so the doc stays compact. */
function mergeRuns(runs) {
  const out = []
  for (const raw of runs) {
    const run = cleanRun(raw)
    if (!run) continue
    const prev = out[out.length - 1]
    if (prev && sameMarks(prev, run)) prev.text += run.text
    else out.push(run)
  }
  return out
}

/**
 * Accept anything and return a valid document. Guards the render path against a
 * hand-edited or partially-written row in the database.
 */
export function normalizeDoc(input) {
  const raw = typeof input === 'string' ? safeParse(input) : input
  if (!raw || !Array.isArray(raw.blocks)) return { v: DOC_VERSION, blocks: [] }

  const blocks = []
  for (const b of raw.blocks) {
    if (!b || !BLOCK_TYPES.has(b.type)) continue
    if (b.type === 'hr') { blocks.push({ type: 'hr' }); continue }
    if (b.type === 'ul' || b.type === 'ol') {
      const items = (Array.isArray(b.items) ? b.items : [])
        .map((item) => mergeRuns(Array.isArray(item) ? item : []))
        .filter((item) => item.length)
      if (items.length) blocks.push({ type: b.type, items })
      continue
    }
    const runs = mergeRuns(Array.isArray(b.runs) ? b.runs : [])
    if (runs.length) blocks.push({ type: b.type, runs })
  }
  return { v: DOC_VERSION, blocks }
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}

export const isEmptyDoc = (doc) => normalizeDoc(doc).blocks.length === 0

/* -------------------------------------------------------------------------- */
/* Render                                                                     */
/* -------------------------------------------------------------------------- */

function renderRuns(runs, keyPrefix) {
  return runs.map((run, i) => {
    const key = `${keyPrefix}r${i}`
    let node = <Fragment key={key}>{run.text}</Fragment>

    // Innermost first so the wrappers read bold > italic > underline > colour.
    if (run.b) node = <strong key={key}>{node}</strong>
    if (run.i) node = <em key={key}>{node}</em>
    if (run.u) node = <u key={key} className={styles.underline}>{node}</u>
    if (run.c) node = <span key={key} className={styles[`c_${run.c}`]}>{node}</span>
    if (run.href) {
      const external = !run.href.startsWith('/')
      node = (
        <a
          key={key}
          href={run.href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {node}
        </a>
      )
    }
    return node
  })
}

/** Render a stored announcement document. */
export default function RichDoc({ doc, className = '' }) {
  const { blocks } = normalizeDoc(doc)
  if (!blocks.length) return null

  return (
    <div className={[styles.prose, className].filter(Boolean).join(' ')}>
      {blocks.map((block, b) => {
        const key = `b${b}`
        switch (block.type) {
          case 'hr': return <hr key={key} />
          case 'h1': return <h3 key={key}>{renderRuns(block.runs, key)}</h3>
          case 'h2': return <h4 key={key}>{renderRuns(block.runs, key)}</h4>
          case 'ul':
            return (
              <ul key={key}>
                {block.items.map((item, j) => <li key={j}>{renderRuns(item, `${key}i${j}`)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key}>
                {block.items.map((item, j) => <li key={j}>{renderRuns(item, `${key}i${j}`)}</li>)}
              </ol>
            )
          default: return <p key={key}>{renderRuns(block.runs, key)}</p>
        }
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Plain text (banner, admin list)                                            */
/* -------------------------------------------------------------------------- */

const runsToText = (runs) => runs.map((r) => r.text).join('')

export function docToPlainText(doc, maxLength = 160) {
  const { blocks } = normalizeDoc(doc)
  const text = blocks
    .map((b) => (b.type === 'hr' ? '' : b.runs ? runsToText(b.runs) : b.items.map(runsToText).join(' ')))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

/** Lead paragraph only — the banner is one line. */
export function docFirstParagraph(doc, maxLength = 200) {
  const { blocks } = normalizeDoc(doc)
  const lead = blocks.find((b) => b.type === 'p')
  if (!lead) return docToPlainText(doc, maxLength)
  const text = runsToText(lead.runs).replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

/* -------------------------------------------------------------------------- */
/* Legacy conversion                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Convert an announcement written in the old marker syntax into a document, so
 * nothing already published is lost when it's next opened for editing.
 */
export function markdownToDoc(text) {
  const blocks = []
  for (const block of parseBlocks(text)) {
    switch (block.type) {
      case 'hr':
        blocks.push({ type: 'hr' })
        break
      case 'heading':
        blocks.push({ type: block.level === 1 ? 'h1' : 'h2', runs: parseInlineRuns(block.text) })
        break
      case 'ul':
      case 'ol':
        blocks.push({ type: block.type, items: block.items.map((item) => parseInlineRuns(item)) })
        break
      default:
        blocks.push({ type: 'p', runs: parseInlineRuns(block.lines.join(' ')) })
    }
  }
  return normalizeDoc({ v: DOC_VERSION, blocks })
}

/* -------------------------------------------------------------------------- */
/* contenteditable bridge                                                     */
/* -------------------------------------------------------------------------- */

const COLOR_HEX = {
  red: '#b03030', green: '#1f5c39', blue: '#27506f', orange: '#8f3f1e', gray: '#4a5866',
}
export const COLOR_TO_HEX = COLOR_HEX

/** rgb(176, 48, 48) / #B03030 -> 'red'. Anything unrecognised is dropped. */
function hexToColorName(value) {
  if (!value) return null
  let hex = String(value).trim().toLowerCase()
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex)
  if (rgb) {
    hex = '#' + [1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')
  }
  for (const [name, h] of Object.entries(COLOR_HEX)) {
    if (h.toLowerCase() === hex) return name
  }
  return null
}

/**
 * Walk a contenteditable subtree and reduce it to a document.
 *
 * This is the security boundary for the editor: whatever the browser (or a
 * paste, or execCommand) leaves in the DOM, only the marks below survive. An
 * <img>, <script> or onclick attribute simply has no representation here and
 * is dropped on save.
 */
export function domToDoc(root) {
  const blocks = []

  const runsFrom = (node, marks = {}) => {
    const runs = []
    const visit = (n, m) => {
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.nodeValue) runs.push({ text: n.nodeValue, ...m })
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return

      const tag = n.tagName.toLowerCase()
      if (tag === 'br') { runs.push({ text: '\n', ...m }); return }

      const next = { ...m }
      if (tag === 'b' || tag === 'strong') next.b = true
      if (tag === 'i' || tag === 'em') next.i = true
      if (tag === 'u' || tag === 'ins') next.u = true
      if (tag === 'a') {
        const href = safeHref(n.getAttribute('href'))
        if (href) next.href = href
      }
      const named = hexToColorName(n.style?.color || n.getAttribute?.('color'))
      if (named) next.c = named
      // Browsers express bold/italic as inline styles too, depending on the
      // command and the paste source.
      const weight = n.style?.fontWeight
      if (weight && (weight === 'bold' || Number(weight) >= 600)) next.b = true
      if (n.style?.fontStyle === 'italic') next.i = true
      if ((n.style?.textDecorationLine || n.style?.textDecoration || '').includes('underline')) next.u = true

      for (const child of n.childNodes) visit(child, next)
    }
    visit(node, marks)
    return mergeRuns(runs)
  }

  const listItems = (node) =>
    [...node.children]
      .filter((li) => li.tagName.toLowerCase() === 'li')
      .map((li) => runsFrom(li))
      .filter((runs) => runs.length)

  // Tags that represent a block, i.e. something that must not be flattened
  // into a paragraph's runs.
  const BLOCK_TAGS = new Set(
    ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'hr', 'blockquote', 'pre']
  )

  /**
   * Walk block level, descending into wrappers.
   *
   * execCommand nests things: turning a line into a list can leave
   * `<div><ul><li>…</li></ul></div>`. Treating that outer div as a paragraph
   * flattened the list into a run of text and lost the bullets entirely, so a
   * container holding block children is recursed into rather than read as
   * inline content.
   */
  const walk = (parent) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const runs = mergeRuns([{ text: node.nodeValue ?? '' }])
        if (runs.length && runs[0].text.trim()) blocks.push({ type: 'p', runs })
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue

      const tag = node.tagName.toLowerCase()
      if (tag === 'hr') { blocks.push({ type: 'hr' }); continue }
      if (tag === 'ul' || tag === 'ol') {
        const items = listItems(node)
        if (items.length) blocks.push({ type: tag, items })
        continue
      }
      if (tag === 'h1' || tag === 'h3') { blocks.push({ type: 'h1', runs: runsFrom(node) }); continue }
      if (tag === 'h2' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        blocks.push({ type: 'h2', runs: runsFrom(node) })
        continue
      }

      if ([...node.children].some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()))) {
        walk(node)
        continue
      }

      // A leaf container is a paragraph. An empty one is a blank line the
      // author typed, which we drop rather than publish.
      const runs = runsFrom(node)
      if (runs.length && runs.some((r) => r.text.trim())) blocks.push({ type: 'p', runs })
    }
  }

  walk(root)
  return normalizeDoc({ v: DOC_VERSION, blocks })
}

/**
 * Build real DOM nodes for a document, to load into the editor.
 * createElement/appendChild rather than innerHTML, so the editor never parses
 * an HTML string either.
 */
export function docToDom(doc, document_) {
  const d = document_ ?? document
  const frag = d.createDocumentFragment()
  const { blocks } = normalizeDoc(doc)

  const appendRuns = (parent, runs) => {
    for (const run of runs) {
      let node = d.createTextNode(run.text)
      if (run.b) { const e = d.createElement('strong'); e.appendChild(node); node = e }
      if (run.i) { const e = d.createElement('em'); e.appendChild(node); node = e }
      if (run.u) { const e = d.createElement('u'); e.appendChild(node); node = e }
      if (run.c) {
        const e = d.createElement('span')
        e.style.color = COLOR_HEX[run.c]
        e.appendChild(node)
        node = e
      }
      if (run.href) {
        const e = d.createElement('a')
        e.setAttribute('href', run.href)
        e.appendChild(node)
        node = e
      }
      parent.appendChild(node)
    }
    if (!runs.length) parent.appendChild(d.createElement('br'))
  }

  for (const block of blocks) {
    if (block.type === 'hr') { frag.appendChild(d.createElement('hr')); continue }
    if (block.type === 'ul' || block.type === 'ol') {
      const list = d.createElement(block.type)
      for (const item of block.items) {
        const li = d.createElement('li')
        appendRuns(li, item)
        list.appendChild(li)
      }
      frag.appendChild(list)
      continue
    }
    const el = d.createElement(block.type === 'h1' ? 'h3' : block.type === 'h2' ? 'h4' : 'p')
    appendRuns(el, block.runs)
    frag.appendChild(el)
  }

  if (!blocks.length) frag.appendChild(d.createElement('p'))
  return frag
}
