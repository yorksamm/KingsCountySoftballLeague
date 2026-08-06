import { StatusBadge, ResultBadge } from '../ui/Badge.jsx'
import { formatDate, formatTime } from '../../lib/format.js'
import { deriveResult } from '../../lib/standings.js'
import { STATUS } from '../../lib/constants.js'
import styles from './GameCard.module.css'

/**
 * One matchup card, laid out horizontally: visitor on the left, home on the
 * right, and the game times down the middle — the way the league writes them
 * ("HEAT @ MACHINE, 9:00am").
 *
 *      HEAT              @              MACHINE
 *      visitor                             home
 *          0      Game 1 · 9:00 am · F      7
 *          0      Game 2 · 10:00 am · F     7
 *
 * The left and right columns are pinned to a TEAM, not to a home/visitor role.
 * That's what makes a swapped Game 2 render correctly — some divisions flip
 * home/away between games of a header (docs Section 4), and a layout keyed on
 * role would put the wrong team's runs in the Game 2 row.
 *
 * @param {object}  matchup           from groupIntoMatchups()
 * @param {?string} highlightTeamId   when filtered to one team, shows its W/L/T
 */
export default function GameCard({ matchup, highlightTeamId = null }) {
  const { anchor, games, field } = matchup
  if (!anchor) return null

  // Column identity comes from Game 1: visitor left, home right.
  const left = { team: anchor.visitor_team, id: anchor.visitor_team_id }
  const right = { team: anchor.home_team, id: anchor.home_team_id }

  const sidesSwap = games.some((g) => g.home_team_id !== anchor.home_team_id)

  const scoreFor = (game, teamId) =>
    game.home_team_id === teamId ? game.home_score
      : game.visitor_team_id === teamId ? game.visitor_score
      : null

  const sideFor = (game, teamId) => (game.home_team_id === teamId ? 'home' : 'visitor')

  /**
   * Score cell: just the runs. The winner's score is bold, which already says
   * who won — a W/L badge beside each team as well was noise saying it twice.
   * The single home-relative badge lives next to the status instead.
   */
  const renderScore = (game, teamId, align) => {
    const result = deriveResult(game, sideFor(game, teamId))
    const score = scoreFor(game, teamId)
    const showScore = game.status === STATUS.FINAL && score != null

    return (
      <span className={[styles.scoreCell, styles[align]].join(' ')}>
        {showScore && (
          <span className={[
            styles.score,
            result === 'W' ? styles.scoreWin : '',
            result === 'L' ? styles.scoreLoss : '',
          ].filter(Boolean).join(' ')}>
            {score}
          </span>
        )}
        {/* Only annotate home/away per game when the header swaps sides;
            otherwise the column headings already say it. */}
        {sidesSwap && (
          <span className={styles.sideTag}>{sideFor(game, teamId) === 'home' ? 'H' : 'V'}</span>
        )}
      </span>
    )
  }

  /**
   * The result, from the HOME team's point of view — one badge per game,
   * beside the status. Home-relative matches how the league reads a scoreline,
   * and it carries the case a bolded score cannot: a resolved forfeit, which
   * has no score at all.
   */
  const homeResultLabel = { W: 'Home team won', L: 'Home team lost', T: 'Tie' }

  const renderTeam = ({ team, id }, align) => (
    <span className={[
      styles.teamCell,
      styles[align],
      highlightTeamId && id === highlightTeamId ? styles.highlight : '',
    ].filter(Boolean).join(' ')}>
      <span className={styles.teamName}>
        {team?.name ?? 'TBD'}
        {team?.is_active === false && (
          <span className={styles.outTag} title="Team withdrew from the season">out</span>
        )}
      </span>
      <span className={styles.role}>{align === 'left' ? 'Visitor' : 'Home'}</span>
    </span>
  )

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span className={styles.date}>{formatDate(anchor.game_date)}</span>
        {anchor.division?.name && <span className={styles.division}>{anchor.division.name}</span>}
      </header>

      <div className={styles.body}>
        <div className={styles.teamRow}>
          {renderTeam(left, 'left')}
          <span className={styles.at} aria-label="at">@</span>
          {renderTeam(right, 'right')}
        </div>

        {games.map((game) => (
          <div key={game.id} className={styles.gameRow}>
            {renderScore(game, left.id, 'right')}

            <span className={styles.center}>
              <span className={styles.gameMeta}>
                {games.length > 1 && (
                  <span className={styles.gameLabel}>Game {game.game_number ?? 1}</span>
                )}
                <span className={styles.gameTime}>{formatTime(game.start_time) || 'Time TBA'}</span>
              </span>
              <span className={styles.gameStatus}>
                <StatusBadge status={game.status} />
                {(() => {
                  const homeResult = deriveResult(game, 'home')
                  return homeResult
                    ? <ResultBadge result={homeResult} title={homeResultLabel[homeResult]} />
                    : null
                })()}
              </span>
            </span>

            {renderScore(game, right.id, 'left')}
          </div>
        ))}
      </div>

      {(field || games.some((g) => g.notes)) && (
        <footer className={styles.foot}>
          {field && (
            <div className={styles.venue}>
              <span className={styles.fieldName}>{field.name}</span>
              {field.address && <span className={styles.address}>{field.address}</span>}
              {field.map_url && (
                <a className={styles.map} href={field.map_url} target="_blank" rel="noopener noreferrer">
                  Map ↗
                </a>
              )}
            </div>
          )}
          {field?.notes && <p className={styles.note}>{field.notes}</p>}
          {games.map((game) => game.notes && (
            <p key={game.id} className={styles.gameNote}>
              <strong>Game {game.game_number ?? 1}:</strong> {game.notes}
            </p>
          ))}
        </footer>
      )}
    </article>
  )
}
