import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getTeams, getDivisions, getGames, getPlayers } from '../lib/api.js'
import { useQueries } from '../hooks/useQuery.js'
import { computeTeamRecord } from '../lib/standings.js'
import { rosterByTeam, byJersey } from '../lib/roster.js'
import { formatPct } from '../lib/format.js'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import Button from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import styles from '../styles/page.module.css'
import teamStyles from './Teams.module.css'

export default function Teams() {
  const [params, setParams] = useSearchParams()
  const division = params.get('division') ?? ''

  const [view, setView] = useState('teams')      // 'teams' | 'players'
  const [openRoster, setOpenRoster] = useState(null)
  const [search, setSearch] = useState('')

  const { data, loading, error, refetch } = useQueries({
    teams: getTeams,
    divisions: getDivisions,
    games: getGames,
    players: getPlayers,
  }, [])

  const rosters = useMemo(() => rosterByTeam(data?.players), [data])

  /** Teams grouped by division, each with its record and roster. */
  const grouped = useMemo(() => {
    if (!data) return []
    const { teams, divisions, games } = data

    return divisions
      .filter((d) => !division || d.id === division)
      .map((d) => ({
        division: d,
        teams: teams
          .filter((t) => t.division_id === d.id)
          .map((t) => ({
            ...t,
            record: computeTeamRecord(games, t.id),
            roster: rosters.get(t.id) ?? [],
          }))
          .sort((a, b) => b.record.pct - a.record.pct || a.name.localeCompare(b.name)),
      }))
      .filter((group) => group.teams.length > 0)
  }, [data, division, rosters])

  /** Every player in the league, for the flat searchable list. */
  const allPlayers = useMemo(() => {
    let list = data?.players ?? []
    if (division) list = list.filter((p) => p.team?.division_id === division)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || String(p.team?.name ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [data, division, search])

  const divisionName = (id) => data?.divisions?.find((d) => d.id === id)?.name ?? ''
  const totalPlayers = data?.players?.length ?? 0

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Teams</h1>
          <p className={styles.subtitle}>
            {view === 'teams'
              ? 'Current season record for every team. Tap a team to see its roster.'
              : 'Every player in the league. Search by player or team name.'}
          </p>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.filter}>
          <label className={styles.filterLabel} htmlFor="t-division">Division</label>
          <select
            id="t-division"
            value={division}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('division', e.target.value)
              else next.delete('division')
              setParams(next, { replace: true })
            }}
          >
            <option value="">All divisions</option>
            {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {view === 'players' && (
          <div className={styles.filter}>
            <label className={styles.filterLabel} htmlFor="t-search">Search</label>
            <input
              id="t-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player or team name…"
            />
          </div>
        )}

        <div className={styles.filterReset}>
          <Button
            variant="ghost"
            onClick={() => { setParams(new URLSearchParams(), { replace: true }); setSearch('') }}
            disabled={!division && !search}
          >
            Clear
          </Button>
        </div>

        <div className={styles.filterReset}>
          <Button onClick={() => setView(view === 'teams' ? 'players' : 'teams')}>
            {view === 'teams' ? 'View all players' : 'View teams'}
          </Button>
        </div>
      </div>

      {loading && <Spinner label="Loading teams…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {/* ---------------- Team cards ---------------- */}
      {!loading && !error && view === 'teams' && (
        <>
          {grouped.length === 0 && (
            <EmptyState title="No teams yet">
              Teams are added under League admin → Teams, or imported from a CSV.
            </EmptyState>
          )}

          {grouped.map(({ division: d, teams }) => (
            <section key={d.id} className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{d.name}</h2>
                <span className={styles.count}>{teams.length} teams</span>
              </div>

              <div className={teamStyles.grid}>
                {teams.map((team) => (
                  <article key={team.id} className={teamStyles.card}>
                    <header className={teamStyles.cardHead}>
                      <h3 className={teamStyles.name}>{team.name}</h3>
                      {team.is_active === false && (
                        <span className={teamStyles.out} title="This team withdrew from the season">
                          Out
                        </span>
                      )}
                    </header>

                    <p className={teamStyles.division}>{d.name}</p>

                    <dl className={teamStyles.record}>
                      <div><dt>Won</dt><dd className="num">{team.record.won}</dd></div>
                      <div><dt>Lost</dt><dd className="num">{team.record.lost}</dd></div>
                      <div><dt>Tied</dt><dd className="num">{team.record.tied}</dd></div>
                      <div><dt>Win%</dt><dd className="num">{formatPct(team.record.pct)}</dd></div>
                    </dl>

                    {/* Roster button rather than making the whole card clickable —
                        the card already contains a link, and nesting interactive
                        elements breaks keyboard navigation. */}
                    <button
                      type="button"
                      className={teamStyles.rosterButton}
                      onClick={() => setOpenRoster(team)}
                      disabled={team.roster.length === 0}
                    >
                      {team.roster.length > 0
                        ? `Roster · ${team.roster.length} player${team.roster.length === 1 ? '' : 's'}`
                        : 'Roster not posted'}
                    </button>

                    <footer className={teamStyles.cardFoot}>
                      <Link to={`/schedule?team=${team.id}`}>Schedule →</Link>
                      {team.contact_name && (
                        <span className={teamStyles.contact}>
                          {team.contact_email
                            ? <a href={`mailto:${team.contact_email}`}>{team.contact_name}</a>
                            : team.contact_name}
                        </span>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {/* ---------------- All players ---------------- */}
      {!loading && !error && view === 'players' && (
        <>
          {totalPlayers === 0 ? (
            <EmptyState title="No rosters posted yet">
              Once league management adds players they'll be listed here, and on each team's card.
            </EmptyState>
          ) : (
            <>
              <p className={styles.count} style={{ marginBottom: '.75rem' }}>
                {allPlayers.length} player{allPlayers.length === 1 ? '' : 's'}
                {allPlayers.length !== totalPlayers && ` of ${totalPlayers}`}
              </p>

              {allPlayers.length === 0 ? (
                <EmptyState title="No players match your search">
                  Try a different name, or clear the filters.
                </EmptyState>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Player</th>
                        <th scope="col" style={{ textAlign: 'center' }}>#</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Team</th>
                        <th scope="col" style={{ textAlign: 'left' }}>Division</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPlayers.map((player) => (
                        <tr key={player.id}>
                          <td className={styles.teamCell}>{player.name}</td>
                          <td className="num" style={{ textAlign: 'center' }}>
                            {player.jersey_number ?? '—'}
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <Link to={`/schedule?team=${player.team_id}`}>{player.team?.name}</Link>
                            {player.team?.is_active === false && (
                              <span className={teamStyles.outInline}>out</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'left' }}>{divisionName(player.team?.division_id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ---------------- Roster popup ---------------- */}
      <Modal
        open={Boolean(openRoster)}
        title={openRoster ? `${openRoster.name} — roster` : ''}
        onClose={() => setOpenRoster(null)}
        width={460}
        footer={<Button onClick={() => setOpenRoster(null)}>Close</Button>}
      >
        {openRoster && (
          <>
            <p className={teamStyles.rosterMeta}>
              {divisionName(openRoster.division_id)} ·{' '}
              {openRoster.record.won}-{openRoster.record.lost}
              {openRoster.record.tied > 0 ? `-${openRoster.record.tied}` : ''} ·{' '}
              {openRoster.roster.length} player{openRoster.roster.length === 1 ? '' : 's'}
            </p>

            <ul className={teamStyles.rosterList}>
              {[...openRoster.roster].sort(byJersey).map((player) => (
                <li key={player.id} className={teamStyles.rosterRow}>
                  <span className={teamStyles.jersey}>
                    {player.jersey_number ?? '—'}
                  </span>
                  <span className={teamStyles.playerName}>{player.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  )
}
