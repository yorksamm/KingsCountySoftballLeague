import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getGames, getDivisions, getTeams } from '../lib/api.js'
import { useQueries } from '../hooks/useQuery.js'
import { groupIntoMatchups } from '../lib/standings.js'
import { STATUS_ORDER, STATUS_META } from '../lib/constants.js'
import GameCard from '../components/games/GameCard.jsx'
import ScheduleKey from '../components/games/ScheduleKey.jsx'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import Button from '../components/ui/Button.jsx'
import { formatDateLong } from '../lib/format.js'
import styles from '../styles/page.module.css'

export default function Schedule() {
  // Filters live in the URL so a filtered view can be linked or bookmarked.
  const [params, setParams] = useSearchParams()
  const division = params.get('division') ?? ''
  const team = params.get('team') ?? ''
  const status = params.get('status') ?? ''
  const [groupByDate, setGroupByDate] = useState(true)

  const { data, loading, error, refetch } = useQueries({
    games: getGames,
    divisions: getDivisions,
    teams: getTeams,
  }, [])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const teamsInDivision = useMemo(() => {
    if (!data?.teams) return []
    // Filtering the team list by the chosen division keeps the dropdown usable.
    return division ? data.teams.filter((t) => t.division_id === division) : data.teams
  }, [data, division])

  const matchups = useMemo(() => {
    if (!data?.games) return []
    const filtered = data.games.filter((g) => {
      if (division && g.division_id !== division) return false
      if (team && g.home_team_id !== team && g.visitor_team_id !== team) return false
      if (status && g.status !== status) return false
      return true
    })
    // Most recent game day first — the season runs to 100+ games and the ones
    // people look up are the ones just played, not April's.
    return groupIntoMatchups(filtered, { newestFirst: true })
  }, [data, division, team, status])

  /** [{ date, matchups: [...] }] for the date-grouped view. */
  const byDate = useMemo(() => {
    const map = new Map()
    for (const matchup of matchups) {
      if (!map.has(matchup.game_date)) map.set(matchup.game_date, [])
      map.get(matchup.game_date).push(matchup)
    }
    return [...map.entries()].map(([date, list]) => ({ date, matchups: list }))
  }, [matchups])

  const hasFilters = Boolean(division || team || status)
  const gameCount = matchups.reduce((sum, m) => sum + m.games.length, 0)

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Schedule</h1>
          <p className={styles.subtitle}>
            Full season. Each card is one matchup — Game 1 and Game 2 together.
          </p>
        </div>
      </header>

      <ScheduleKey />

      <div className={styles.filters}>
        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="f-division">Division</label>
          <select
            id="f-division"
            value={division}
            onChange={(e) => {
              setFilter('division', e.target.value)
              // A team from the old division would filter everything away.
              if (team) setFilter('team', '')
            }}
          >
            <option value="">All divisions</option>
            {data?.divisions?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="f-team">Team</label>
          <select id="f-team" value={team} onChange={(e) => setFilter('team', e.target.value)}>
            <option value="">All teams</option>
            {teamsInDivision.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.is_active === false ? ' (out)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].code} — {STATUS_META[s].name}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterReset}>
          <Button
            variant="ghost"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
            disabled={!hasFilters}
          >
            Clear filters
          </Button>
        </div>

        <div className={styles.filterReset}>
          <Button variant="ghost" onClick={() => setGroupByDate((v) => !v)}>
            {groupByDate ? 'Ungroup dates' : 'Group by date'}
          </Button>
        </div>
      </div>

      {loading && <Spinner label="Loading schedule…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <p className={styles.count} style={{ marginBottom: '1rem' }}>
            {matchups.length} matchup{matchups.length === 1 ? '' : 's'} · {gameCount} game{gameCount === 1 ? '' : 's'}
            {team && ' · W/L/T shown for the selected team'}
          </p>

          {matchups.length === 0 && (
            <EmptyState title="No games match these filters">
              Try clearing a filter, or check the Home page for the latest results.
            </EmptyState>
          )}

          {groupByDate
            ? byDate.map(({ date, matchups: list }) => (
                <section key={date} className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>{formatDateLong(date)}</h2>
                    <span className={styles.count}>{list.length} matchup{list.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className={styles.cardGrid}>
                    {list.map((matchup) => (
                      <GameCard key={matchup.key} matchup={matchup} highlightTeamId={team || null} />
                    ))}
                  </div>
                </section>
              ))
            : (
              <div className={styles.cardGrid}>
                {matchups.map((matchup) => (
                  <GameCard key={matchup.key} matchup={matchup} highlightTeamId={team || null} />
                ))}
              </div>
            )}
        </>
      )}
    </div>
  )
}
