import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getUpcomingGames } from '../lib/api.js'
import { useQuery } from '../hooks/useQuery.js'
import { groupIntoMatchups } from '../lib/standings.js'
import GameCard from '../components/games/GameCard.jsx'
import ScheduleKey from '../components/games/ScheduleKey.jsx'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import styles from '../styles/page.module.css'
import upcomingStyles from './Upcoming.module.css'
import { usePageMeta } from '../hooks/usePageMeta.js'

export default function Upcoming() {
  usePageMeta({
    title: 'Upcoming Games',
    description:
      'Upcoming Kings County Softball League games — dates, start times, fields and matchups across all divisions.',
  })
  /** Upcoming games only. Past results live on the Schedule page. */
  const { data, loading, error, refetch } = useQuery(() => getUpcomingGames(60), [])

  const matchups = useMemo(() => (data ? groupIntoMatchups(data) : []), [data])

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={`${styles.pageHead} ${upcomingStyles.column}`}>
        <div>
          <h1 className={styles.title}>Upcoming Games</h1>
          <p className={styles.subtitle}>All divisions. Scores are Visitor – Home.</p>
        </div>
        <Link to="/schedule" className={styles.count}>Full schedule →</Link>
      </header>

      <div className={upcomingStyles.column}>
        <ScheduleKey />
      </div>

      {loading && <Spinner label="Loading games…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && matchups.length === 0 && (
        <div className={upcomingStyles.column}>
          <EmptyState title="No upcoming games scheduled">
            Nothing is on the calendar right now. Past results and the full season
            are on the <Link to="/schedule">Schedule</Link> page.
          </EmptyState>
        </div>
      )}

      {!loading && !error && matchups.length > 0 && (
        <div className={upcomingStyles.feed}>
          {matchups.map((matchup) => (
            <GameCard key={matchup.key} matchup={matchup} />
          ))}
        </div>
      )}
    </div>
  )
}
