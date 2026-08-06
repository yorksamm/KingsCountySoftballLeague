import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { signIn } from '../../lib/adminApi.js'
import { LEAGUE } from '../../lib/constants.js'
import Button from '../../components/ui/Button.jsx'
import styles from './AdminLogin.module.css'
import { usePageMeta } from '../../hooks/usePageMeta.js'

export default function AdminLogin() {
  // The admin panel must never appear in search results. robots.txt asks
  // crawlers not to fetch /admin; this tells any that do anyway not to index.
  usePageMeta({ title: 'League Admin', noindex: true })
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const from = location.state?.from || '/admin/results'

  useEffect(() => {
    if (!loading && session) navigate(from, { replace: true })
  }, [session, loading, from, navigate])

  if (!loading && session) return <Navigate to={from} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setAttempts((n) => n + 1)
      setError(err.message || 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>{LEAGUE.short}</span>
          <div>
            <h1 className={styles.title}>League Admin</h1>
            <p className={styles.subtitle}>{LEAGUE.name}</p>
          </div>
        </div>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
              {/* Supabase throttles repeated failures; say so rather than
                  letting a lockout look like a wrong password (docs 8.6). */}
              {attempts >= 3 && (
                <span className={styles.errorHint}>
                  After several failed attempts Supabase will temporarily block
                  sign-in from this address. Wait a minute before trying again.
                </span>
              )}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className={styles.note}>
          There is no public sign-up. Accounts are created by the league
          administrator in the Supabase dashboard under Authentication → Users.
        </p>

        <Link to="/" className={styles.back}>← Back to the public site</Link>
      </div>
    </div>
  )
}
