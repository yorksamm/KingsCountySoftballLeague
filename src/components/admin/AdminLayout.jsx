import { useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { signOut } from '../../lib/adminApi.js'
import { LEAGUE } from '../../lib/constants.js'
import styles from './AdminLayout.module.css'
import { usePageMeta } from '../../hooks/usePageMeta.js'

const NAV = [
  { to: '/admin/results',       label: 'Game Results', hint: 'Enter scores' },
  { to: '/admin/schedule',      label: 'Schedule',     hint: 'Add & edit games' },
  { to: '/admin/teams',         label: 'Teams' },
  { to: '/admin/roster',        label: 'Rosters',      hint: 'Players & numbers' },
  { to: '/admin/divisions',     label: 'Divisions' },
  { to: '/admin/fields',        label: 'Fields' },
  { to: '/admin/announcements', label: 'Announcements' },
  { to: '/admin/rules',         label: 'Rules PDF' },
]

export default function AdminLayout() {
  // The admin panel must never appear in search results. robots.txt asks
  // crawlers not to fetch /admin; this tells any that do anyway not to index.
  usePageMeta({ title: 'League Admin', noindex: true })
  const { user } = useAuth()
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <button
            type="button"
            className={styles.navToggle}
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label="Toggle admin navigation"
          >
            ☰
          </button>

          <Link to="/admin" className={styles.brand}>
            <img className={styles.mark} src="/kcsl-mark.png" width="96" height="96" alt="" aria-hidden="true" />
            <span>Admin</span>
          </Link>

          <div className={styles.topbarRight}>
            <Link to="/" className={styles.viewSite} target="_blank" rel="noopener noreferrer">
              View public site ↗
            </Link>
            <span className={styles.user} title={user?.email}>{user?.email}</span>
            <button type="button" className={styles.signOut} onClick={handleSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={[styles.sidebar, navOpen ? styles.sidebarOpen : ''].filter(Boolean).join(' ')}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
              }
            >
              <span className={styles.navLabel}>{item.label}</span>
              {item.hint && <span className={styles.navHint}>{item.hint}</span>}
            </NavLink>
          ))}
        </nav>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
