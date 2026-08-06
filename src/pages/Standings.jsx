import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getGames, getTeams, getDivisions } from '../lib/api.js'
import { useQueries } from '../hooks/useQuery.js'
import { computeStandings, STANDINGS_ROSTER_BASED } from '../lib/standings.js'
import { formatPct, formatGB, formatRD } from '../lib/format.js'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import Button from '../components/ui/Button.jsx'
import styles from '../styles/page.module.css'
import standingsStyles from './Standings.module.css'
import { usePageMeta } from '../hooks/usePageMeta.js'

const COLUMNS = [
  { key: 'won',  label: 'W',    title: 'Won' },
  { key: 'lost', label: 'L',    title: 'Lost' },
  { key: 'tied', label: 'T',    title: 'Tied' },
  { key: 'pct',  label: 'Pct.', title: '(Wins + Ties × 0.5) ÷ Games Played' },
  { key: 'gb',   label: 'GB',   title: 'Games behind the division leader' },
  { key: 'rf',   label: 'RF',   title: 'Runs For' },
  { key: 'ra',   label: 'RA',   title: 'Runs Against' },
  { key: 'rd',   label: 'RD',   title: 'Run differential (RF − RA)' },
]

export default function Standings() {
  usePageMeta({
    title: 'Standings',
    description:
      'Kings County Softball League standings by division — wins, losses, ties, win percentage, games behind and run differential.',
  })
  const [params, setParams] = useSearchParams()
  const division = params.get('division') ?? ''

  const { data, loading, error, refetch } = useQueries({
    games: getGames,
    teams: getTeams,
    divisions: getDivisions,
  }, [])

  /**
   * Recomputed from game rows on every load — there is no stored W/L, so a
   * standings table can never drift from the schedule (docs Section 7).
   */
  const tables = useMemo(() => {
    if (!data) return []
    return data.divisions
      .filter((d) => !division || d.id === division)
      .map((d) => ({
        division: d,
        rows: computeStandings(data.games, data.teams, d.id),
      }))
      .filter((t) => t.rows.length > 0)
  }, [data, division])

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Standings</h1>
          <p className={styles.subtitle}>
            Sorted by win percentage, then run differential. Updated the moment a
            result is entered.
          </p>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="s-division">Division</label>
          <select
            id="s-division"
            value={division}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('division', e.target.value)
              else next.delete('division')
              setParams(next, { replace: true })
            }}
          >
            <option value="">All divisions</option>
            {data?.divisions?.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterReset}>
          <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })} disabled={!division}>
            Clear filter
          </Button>
        </div>
      </div>

      {loading && <Spinner label="Calculating standings…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && tables.length === 0 && (
        <EmptyState title="No standings yet">
          Standings appear once games are marked Final or a forfeit is resolved.
        </EmptyState>
      )}

      {tables.map(({ division: d, rows }) => (
        <section key={d.id} className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>{d.name}</h2>
            <span className={styles.count}>{rows.length} teams</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} scope="col" title={col.title}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.team_id} className={index === 0 && row.gp > 0 ? styles.leaderRow : undefined}>
                    <td className={styles.teamCell}>
                      <span className={styles.rank}>{index + 1}</span>
                      <Link to={`/schedule?team=${row.team_id}`}>{row.team}</Link>
                      {!row.is_active && (
                        <span className={standingsStyles.out} title="Team withdrew from the season">out</span>
                      )}
                    </td>
                    <td className="num">{row.won}</td>
                    <td className="num">{row.lost}</td>
                    <td className="num">{row.tied}</td>
                    <td className="num"><strong>{formatPct(row.pct)}</strong></td>
                    <td className="num">{formatGB(row.gb)}</td>
                    <td className="num">{row.rf}</td>
                    <td className="num">{row.ra}</td>
                    <td className={`num ${row.rd > 0 ? standingsStyles.pos : row.rd < 0 ? standingsStyles.neg : ''}`}>
                      {formatRD(row.rd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!loading && !error && tables.length > 0 && (
        <aside className={standingsStyles.legend}>
          <h3 className={standingsStyles.legendTitle}>How these are calculated</h3>
          <ul>
            <li><strong>Pct.</strong> = (Wins + Ties × 0.5) ÷ Games Played</li>
            <li><strong>GB</strong> = ((Leader W − Leader L) − (Team W − Team L)) ÷ 2</li>
            <li><strong>RD</strong> = RF − RA</li>
            <li>
              <strong>Counted:</strong> final games and resolved forfeits (FFT-L, FFT-W).
              A final game with equal scores is a tie for both teams.
            </li>
            <li>
              <strong>Not counted:</strong> TBP, N/R, CAN, PPD, SPD, and unresolved
              forfeits (FFT) are excluded until their status changes.
            </li>
            <li>
              A resolved forfeit awards the win and loss but contributes no runs to
              RF, RA, or RD for either team.
            </li>
            {STANDINGS_ROSTER_BASED && (
              <li>
                Each team appears in its own division’s table, and its record counts
                every game it played — including crossover games against teams from
                another division.
              </li>
            )}
          </ul>
        </aside>
      )}
    </div>
  )
}
