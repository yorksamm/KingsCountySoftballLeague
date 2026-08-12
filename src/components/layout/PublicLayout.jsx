import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { getActiveAnnouncements } from '../../lib/api.js'
import { firstParagraph } from '../../lib/richText.jsx'
import { docFirstParagraph } from '../../lib/richDoc.jsx'
import { LEAGUE } from '../../lib/constants.js'
import { isConfigured } from '../../lib/supabase.js'
import styles from './PublicLayout.module.css'

const NAV = [
  { to: '/',          label: 'Home',      end: true },
  { to: '/upcoming',  label: 'Upcoming' },
  { to: '/schedule',  label: 'Schedule' },
  { to: '/teams',     label: 'Teams' },
  { to: '/standings', label: 'Standings' },
  { to: '/rules',     label: 'Rules' },
]

/** Small padlock, inline so there's no icon dependency or network request. */
function LockIcon() {
  return (
    <svg
      className={styles.lockIcon}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  )
}

/**
 * Announcement banner.
 *
 * Dismissal is stored in sessionStorage — "dismiss for the session, local to
 * the browser, not persisted server-side" (docs Section 2). Closing the tab
 * brings it back, which is what the league wants for weather notices.
 */
function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isConfigured) return
    let active = true
    getActiveAnnouncements()
      .then((rows) => {
        if (!active) return
        // ONLY pinned announcements ride the banner. Every published
        // announcement is already the body of the home page, so banner-ing all
        // of them would show the same text twice on the landing page. Pinning
        // is now the explicit "important enough to follow people around the
        // site" switch.
        const top = rows.find((row) => row.pinned) ?? null
        setAnnouncement(top)
        if (top && sessionStorage.getItem(`kcsl.dismissed.${top.id}`) === '1') {
          setDismissed(true)
        }
      })
      .catch((err) => console.error('[KCSL] announcements failed to load:', err))
    return () => { active = false }
  }, [])

  if (!announcement || dismissed) return null

  const dismiss = () => {
    try { sessionStorage.setItem(`kcsl.dismissed.${announcement.id}`, '1') } catch { /* private mode */ }
    setDismissed(true)
  }

  return (
    <div className={styles.banner} role="status">
      <div className={`wrap ${styles.bannerInner}`}>
        <div className={styles.bannerText}>
          <span className={styles.pin} title="Pinned">★</span>
          <strong className={styles.bannerTitle}>{announcement.title}</strong>
          {(announcement.body_doc || announcement.body) && (
            // Lead paragraph only — the banner is a one-line strip and the
            // full post is on the home page behind "Read more".
            <span className={styles.bannerBody}>
              {announcement.body_doc
                ? docFirstParagraph(announcement.body_doc, 200)
                : firstParagraph(announcement.body, 200)}
            </span>
          )}
          <NavLink to="/" className={styles.bannerMore}>Read more</NavLink>
        </div>
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Dismiss announcement">
          ×
        </button>
      </div>
    </div>
  )
}

export default function PublicLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={styles.shell}>
      {/* The banner sits BELOW the nav, not above it. A long weather notice can
          run to half a phone screen, and above the nav it pushed the whole site
          off the top of the viewport on arrival. Below it, the sticky nav is
          always the first thing on screen and the banner scrolls away. */}
      <header className={styles.header}>
        <div className={`wrap ${styles.headerInner}`}>
          <NavLink to="/" className={styles.brand} onClick={() => setMenuOpen(false)}>
            <img
              className={styles.mark}
              src="/kcsl-mark.png"
              width="128"
              height="128"
              alt=""
              aria-hidden="true"
            />
            <span className={styles.brandName}>{LEAGUE.name}</span>
          </NavLink>

          <button
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>

          <nav className={[styles.nav, menuOpen ? styles.navOpen : ''].filter(Boolean).join(' ')}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}

            {/* Second way in, so admins don't have to scroll past a
                hundred-game schedule to reach the footer. Separated and
                outlined so it doesn't read as another public page. */}
            <NavLink
              to="/admin"
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                [styles.navAdmin, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              <LockIcon />
              Admin
            </NavLink>
          </nav>
        </div>
      </header>

      <AnnouncementBanner />

      <main className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={`wrap ${styles.footerInner}`}>
          <div className={styles.footerText}>
            <span className={styles.footerName}>{LEAGUE.name}</span>
            <span className={styles.footerMeta}>
              © {new Date().getFullYear()}
              {LEAGUE.email && (
                <>
                  {' · '}
                  <a href={`mailto:${LEAGUE.email}`}>{LEAGUE.email}</a>
                </>
              )}
            </span>
          </div>

          {/* A real button, not a 13px text link. The league runs on volunteers
              who are mostly not twenty, and this is the one control they need
              to find on a page they otherwise only read. */}
          <NavLink to="/admin" className={styles.adminButton}>
            <LockIcon />
            League Admin Log In
          </NavLink>
        </div>
      </footer>
    </div>
  )
}
