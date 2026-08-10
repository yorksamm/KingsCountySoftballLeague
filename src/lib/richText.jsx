import { Fragment, useMemo } from 'react'
import styles from './richText.module.css'
import { TEXT_COLORS } from './palette.js'

/**
 * A small, deliberately limited formatting language for announcements.
 *
 * WHY NOT A MARKDOWN LIBRARY: every one of them ultimately hands you an HTML
 * string, which means `dangerouslySetInnerHTML`. Docs Section 8.3 rules that
 * out — the admin session token lives in localStorage, so an injected script
 * would be a real problem, and announcement text is the one place in this app
 * where a human types content that everyone else reads.
 *
 * This parser never produces HTML. It builds React elements, which React
 * escapes on its own, so a body containing `<script>` renders as those literal
 * characters and nothing else. The only genuinely dangerous surface left is
 * link hrefs, handled by safeHref below.
 *
 * Supported:
 *   # Heading            ## Smaller heading      ### Smallest heading
 *   - bullet             1. numbered
 *   **bold**             *italic*
 *   [text](https://…)    ---  (divider)
 *   Blank line separates paragraphs.
 */

const SAFE_PROTOCOL = /^(https?:|mailto:)/i
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+(\/|$)/

/** Returns a usable href, or null if the link should be shown as plain text. */
function safeHref(raw) {
  const href = String(raw ?? '').trim()
  if (!href) return null
  if (SAFE_PROTOCOL.test(href)) return href
  if (href.startsWith('/')) return href                 // internal path
  if (BARE_DOMAIN.test(href)) return `https://${href}`  // "kcsl.org/rules"
  return null   // javascript:, data:, vbscript:, anything else
}

// The legacy `{red:…}` syntax accepts whatever the shared palette defines, so
// old announcements keep parsing as the palette grows. See lib/palette.js.
const COLOR_NAMES = Object.keys(TEXT_COLORS).join('|')

export { TEXT_COLORS }

/*
 * Bold has to be able to contain a lone `*` so `**bold with *italic* in**`
 * matches at all — `[^*\n]+` made bold fail on that input and italic then
 * grabbed the wrong spans. `\*(?!\*)` allows a single star but never `**`,
 * which is what stops the greedy repeat running past the closing delimiter:
 * in `**one** and **two**` the repeat cannot swallow the `**` after `one`.
 */
const BOLD_INNER = '(?:[^*\\n]|\\*(?!\\*))+'

// Split on the inline markers while keeping the delimiters. Order matters:
// ** before *, so bold isn't eaten by italic.
const INLINE = new RegExp(
  '(' +
  `\\{(?:${COLOR_NAMES}):[^{}\\n]+\\}` + '|' +   // {red:coloured}
  '\\+\\+[^\\n]+?\\+\\+' + '|' +                  // ++underlined++
  `\\*\\*${BOLD_INNER}\\*\\*` + '|' +             // **bold**
  '\\*[^*\\n]+\\*' + '|' +                        // *italic*
  '\\[[^\\]\\n]+\\]\\([^)\\s]+\\)' +              // [text](url)
  ')',
  'g'
)

const RE_COLOR = new RegExp(`^\\{(${COLOR_NAMES}):([^{}\\n]+)\\}$`)
const RE_UNDERLINE = /^\+\+([^\n]+?)\+\+$/
const RE_BOLD = new RegExp(`^\\*\\*(${BOLD_INNER})\\*\\*$`)
const RE_ITALIC = /^\*([^*\n]+)\*$/

/**
 * Deep enough for every sane combination (colour > bold > underline > italic)
 * with room to spare. Content strictly shrinks on each recursion — every
 * wrapper strips at least two characters per side — so runaway recursion is
 * impossible and this is only a backstop.
 */
const MAX_DEPTH = 6

function renderInline(text, keyPrefix, depth = 0) {
  /**
   * Render a wrapper's contents. EVERY format recurses through this — bold and
   * italic used to return their inner text raw, which meant whichever format
   * was on the outside won and anything inside bold or italic stayed literal
   * (`**{red:x}**` printed the braces). At max depth we still strip the
   * markers rather than leaking them into the page.
   */
  const kids = (inner, suffix) =>
    depth < MAX_DEPTH ? renderInline(inner, `${keyPrefix}${suffix}`, depth + 1) : inner

  return String(text)
    .split(INLINE)
    .filter((part) => part !== '' && part != null)
    .map((part, i) => {
      const key = `${keyPrefix}i${i}`
      let m

      if ((m = RE_COLOR.exec(part))) {
        return (
          <span key={key} className={styles[`c_${m[1]}`]}>
            {kids(m[2], `${i}c`)}
          </span>
        )
      }
      if ((m = RE_UNDERLINE.exec(part))) {
        return <u key={key} className={styles.underline}>{kids(m[1], `${i}u`)}</u>
      }
      if ((m = RE_BOLD.exec(part))) {
        return <strong key={key}>{kids(m[1], `${i}b`)}</strong>
      }
      if ((m = RE_ITALIC.exec(part))) {
        return <em key={key}>{kids(m[1], `${i}e`)}</em>
      }

      if ((m = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(part))) {
        const href = safeHref(m[2])
        if (!href) return <Fragment key={key}>{m[1]}</Fragment>
        const external = !href.startsWith('/')
        return (
          <a
            key={key}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {m[1]}
          </a>
        )
      }

      return <Fragment key={key}>{part}</Fragment>
    })
}

/**
 * Same grammar as renderInline, but produces flat styled runs instead of React
 * elements — the bridge that lets an announcement written in the old marker
 * syntax be opened in the WYSIWYG editor (see lib/richDoc.jsx).
 *
 * @returns {{text:string,b?:boolean,i?:boolean,u?:boolean,c?:string,href?:string}[]}
 */
export function parseInlineRuns(text, marks = {}, depth = 0) {
  const out = []
  const push = (inner, extra) => {
    const nested = depth < MAX_DEPTH
      ? parseInlineRuns(inner, { ...marks, ...extra }, depth + 1)
      : [{ text: inner, ...marks, ...extra }]
    out.push(...nested)
  }

  for (const part of String(text ?? '').split(INLINE)) {
    if (part === '' || part == null) continue
    let m

    if ((m = RE_COLOR.exec(part))) { push(m[2], { c: m[1] }); continue }
    if ((m = RE_UNDERLINE.exec(part))) { push(m[1], { u: true }); continue }
    if ((m = RE_BOLD.exec(part))) { push(m[1], { b: true }); continue }
    if ((m = RE_ITALIC.exec(part))) { push(m[1], { i: true }); continue }

    if ((m = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(part))) {
      const href = safeHref(m[2])
      out.push(href ? { text: m[1], ...marks, href } : { text: m[1], ...marks })
      continue
    }

    out.push({ text: part, ...marks })
  }

  return out.filter((run) => run.text !== '')
}

const RE_HEADING = /^(#{1,3})\s+(.*)$/
const RE_HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const RE_UL = /^\s*[-*+]\s+(.*)$/
const RE_OL = /^\s*\d+[.)]\s+(.*)$/

const isBlockStart = (line) =>
  RE_HEADING.test(line) || RE_HR.test(line) || RE_UL.test(line) || RE_OL.test(line)

/** Text -> a flat list of block descriptors. Exported for the admin preview. */
export function parseBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) { i++; continue }

    // Divider is checked before lists so "---" isn't read as a bullet.
    if (RE_HR.test(line)) { blocks.push({ type: 'hr' }); i++; continue }

    let m
    if ((m = RE_HEADING.exec(line))) {
      blocks.push({ type: 'heading', level: m[1].length, text: m[2] })
      i++
      continue
    }

    if (RE_UL.test(line)) {
      const items = []
      while (i < lines.length && RE_UL.test(lines[i])) {
        items.push(RE_UL.exec(lines[i])[1])
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (RE_OL.test(line)) {
      const items = []
      while (i < lines.length && RE_OL.test(lines[i])) {
        items.push(RE_OL.exec(lines[i])[1])
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Paragraph: consecutive lines until a blank line or a new block starts.
    const para = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', lines: para })
  }

  return blocks
}

/**
 * Render announcement body text.
 *
 * Heading levels start at h3 because the page supplies h1 and each
 * announcement title is an h2 — keeping the document outline valid for screen
 * readers rather than jumping straight from h2 to h1.
 */
export default function RichText({ text, className = '' }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  if (!blocks.length) return null

  return (
    <div className={[styles.prose, className].filter(Boolean).join(' ')}>
      {blocks.map((block, b) => {
        switch (block.type) {
          case 'heading': {
            const Tag = ['h3', 'h4', 'h5'][block.level - 1]
            return <Tag key={b}>{renderInline(block.text, `b${b}`)}</Tag>
          }
          case 'hr':
            return <hr key={b} />
          case 'ul':
            return (
              <ul key={b}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item, `b${b}l${j}`)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={b}>
                {block.items.map((item, j) => <li key={j}>{renderInline(item, `b${b}l${j}`)}</li>)}
              </ol>
            )
          default:
            return (
              <p key={b}>
                {block.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(line, `b${b}l${j}`)}
                  </Fragment>
                ))}
              </p>
            )
        }
      })}
    </div>
  )
}

/**
 * The opening paragraph only, as plain text — for the site banner.
 *
 * Flattening the WHOLE body reads badly the moment an announcement has
 * structure: the first heading gets glued onto the end of the intro
 * ("…times and fields. How seeding was decided Standing…"). Taking just the
 * lead paragraph gives a summary that reads like a sentence, and the full post
 * is one click away on the home page.
 */
export function firstParagraph(text, maxLength = 200) {
  const lead = parseBlocks(text).find((b) => b.type === 'p')
  if (!lead) return toPlainText(text, maxLength)
  return toPlainText(lead.lines.join(' '), maxLength)
}

/** One-line plain-text summary, for the admin list. */
export function toPlainText(text, maxLength = 160) {
  const flat = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    // Colour and underline unwrap to their contents — the banner and the admin
    // list are plain text, so the markers must not leak into them.
    .replace(new RegExp(`\\{(?:${COLOR_NAMES}):([^{}\\n]+)\\}`, 'g'), '$1')
    .replace(/\+\+([^\n]+?)\+\+/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1).trimEnd()}…` : flat
}
