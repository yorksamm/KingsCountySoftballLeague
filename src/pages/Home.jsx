import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getActiveAnnouncements, getUpcomingGames } from '../lib/api.js'
import { useQueries } from '../hooks/useQuery.js'
import RichText from '../lib/richText.jsx'
import RichDoc from '../lib/richDoc.jsx'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import { formatDateLong, parseLocalDate } from '../lib/format.js'
import { LEAGUE } from '../lib/constants.js'
import styles from './Home.module.css'
import { usePageMeta } from '../hooks/usePageMeta.js'

/**
 * The landing page is league news: every published announcement, in full.
 *
 * Games moved to their own page — a season's worth of matchup cards buried the
 * notices nobody was reading, and the notices are what the league actually
 * needs people to see when they arrive.
 */
export default function Home() {
  usePageMeta({
    title: 'League news, notices and announcements',
    description:
      'Announcements, rainouts, playoff information and league notices for the Kings County Softball League in Brooklyn, NY.',
  })
  const { data, loading, error, refetch } = useQueries({
    announcements: getActiveAnnouncements,
    upcoming: () => getUpcomingGames(60),
  }, [])

  /** Next game day, for the strip that links across to the games page. */
  const nextDay = useMemo(() => {
    const games = data?.upcoming ?? []
    if (!games.length) return null
    const date = games[0].game_date
    return { date, count: games.filter((g) => g.game_date === date).length }
  }, [data])

  const announcements = data?.announcements ?? []

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.masthead}>
        {/* The logo already says the league's name, so repeating it as visible
            text would just be the same words twice. The h1 stays for search
            engines and screen readers, hidden visually. */}
        <h1 className="visually-hidden">{LEAGUE.name}</h1>
        {/* Not lazy-loaded: this is the largest paint on the page and sits
            above the fold, so deferring it would only delay it. width/height
            are set so the browser reserves the space and the page doesn't
            jump when the file arrives.
            `fetchpriority` is lowercase on purpose — React 18 only forwards
            the camelCase spelling from v19 onward, and warns instead of
            passing it through. */}
        <img
          className={styles.logo}
          src="/kcsl-logo-1280.jpg"
          srcSet="/kcsl-logo-800.jpg 800w, /kcsl-logo-1280.jpg 1280w"
          sizes="(max-width: 760px) 100vw, 720px"
          width="1280"
          height="853"
          alt="Kings County Softball League — American Softball Association. Play. Compete. Respect."
          fetchpriority="high"
        />
        <p className={styles.tagline}>League news, notices, and information</p>
      </header>

      {/* Landing page still has to answer "when do we play next?" in one look,
          even though the games themselves now live elsewhere. */}
      {nextDay && (
        <Link to="/upcoming" className={styles.nextStrip}>
          <span className={styles.nextLabel}>Next games</span>
          <span className={styles.nextDate}>{formatDateLong(nextDay.date)}</span>
          <span className={styles.nextCount}>
            {nextDay.count} game{nextDay.count === 1 ? '' : 's'}
          </span>
          <span className={styles.nextGo} aria-hidden="true">→</span>
        </Link>
      )}

      {loading && <Spinner label="Loading league news…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && announcements.length === 0 && (
        <EmptyState title="No announcements posted">
          League notices will appear here. In the meantime, the{' '}
          <Link to="/upcoming">upcoming games</Link> and{' '}
          <Link to="/standings">standings</Link> are up to date.
        </EmptyState>
      )}

      {!loading && !error && announcements.length > 0 && (
        <div className={styles.feed}>
          {announcements.map((post) => {
            const posted = parseLocalDate(String(post.created_at).slice(0, 10))
            return (
              <article
                key={post.id}
                className={[styles.post, post.pinned ? styles.pinned : ''].filter(Boolean).join(' ')}
              >
                <header className={styles.postHead}>
                  {post.pinned && (
                    <span className={styles.pinnedTag}>
                      <span aria-hidden="true">★</span> Important
                    </span>
                  )}
                  <h2 className={styles.postTitle}>{post.title}</h2>
                  {posted && (
                    <time className={styles.postDate} dateTime={String(post.created_at).slice(0, 10)}>
                      {formatDateLong(String(post.created_at).slice(0, 10))}
                    </time>
                  )}
                </header>

                {/* Announcements written in the WYSIWYG editor carry a
                    structured document. Anything published before that keeps
                    rendering from its original text. */}
                {post.body_doc
                  ? <RichDoc doc={post.body_doc} />
                  : <RichText text={post.body} />}
              </article>
            )
          })}
        </div>
      )}

      <footer className={styles.pageFoot}>
        <Link to="/upcoming" className={styles.footLink}>Upcoming games →</Link>
        <Link to="/schedule" className={styles.footLink}>Full schedule →</Link>
        <Link to="/standings" className={styles.footLink}>Standings →</Link>
        <Link to="/rules" className={styles.footLink}>League rules →</Link>
      </footer>
    </div>
  )
}
