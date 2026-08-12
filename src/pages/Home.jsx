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
 * Where the rest of the site lives, as tiles at the foot of the page.
 *
 * These were four bare text links in a row, which nobody clicked. A tile is a
 * far bigger target; the label alone carries it, so there is no description.
 */
const PAGE_TILES = [
  { to: '/upcoming',  title: 'Upcoming games' },
  { to: '/schedule',  title: 'Full schedule' },
  { to: '/standings', title: 'Standings' },
  { to: '/rules',     title: 'League rules' },
]

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
        {/* Logo beside the name rather than above it. Stacked, a square badge
            in a 720px reading column left a lot of dead space either side on a
            laptop; as a row it fills the measure and reads as a masthead. It
            stacks back to centred on narrow screens.
            Not lazy-loaded: largest paint on the page, above the fold.
            `fetchpriority` is lowercase because React 18 only forwards the
            camelCase spelling from v19 onward. */}
        <img
          className={styles.logo}
          src="/kcsl-logo.png"
          width="512"
          height="512"
          alt=""
          aria-hidden="true"
          fetchpriority="high"
        />
        {/* The badge carries the league name in its own artwork, so the
            heading is not drawn — but a page still needs an h1, both for the
            document outline screen readers announce and for the name Google
            shows in a result. Hidden visually, present in the markup. */}
        <h1 className="visually-hidden">{LEAGUE.name}</h1>
      </header>

      {/* Landing page still has to answer "when do we play next?" in one look,
          even though the games themselves now live elsewhere. */}
      {nextDay && (
        <>
          <h2 className={styles.eyebrow}>Upcoming Games</h2>
          <Link to="/upcoming" className={styles.nextStrip}>
            <span className={styles.nextDate}>{formatDateLong(nextDay.date)}</span>
            <span className={styles.nextCount}>
              {nextDay.count} game{nextDay.count === 1 ? '' : 's'}
            </span>
            <span className={styles.nextGo} aria-hidden="true">→</span>
          </Link>
        </>
      )}

      {/* Labelled even while loading or empty, so the page keeps its shape
          instead of the heading popping in once the query lands. */}
      <h2 className={styles.eyebrow}>League news</h2>

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
                  {/* h3, not h2: the section eyebrows above are the page's h2s,
                      and a post sits under "League news". */}
                  <h3 className={styles.postTitle}>{post.title}</h3>
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

      <h2 className={`${styles.eyebrow} ${styles.eyebrowTop}`}>More from the league</h2>
      <nav className={styles.tiles} aria-label="League pages">
        {PAGE_TILES.map((tile) => (
          <Link key={tile.to} to={tile.to} className={styles.tile}>
            <span className={styles.tileTitle}>{tile.title}</span>
            <span className={styles.tileGo} aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
