import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import CsvImport from '../../components/admin/CsvImport.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState, EmptyState } from '../../components/ui/Spinner.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getGames, getDivisions } from '../../lib/api.js'
import { saveGameResults, downloadResultsCsv, importResultsCsv } from '../../lib/adminApi.js'
import { deriveResult } from '../../lib/standings.js'
import { STATUS, STATUS_ORDER, STATUS_META, AWAITING_RESULT } from '../../lib/constants.js'
import { formatDate, formatTime, todayLocalISO } from '../../lib/format.js'
import formStyles from '../../styles/form.module.css'
import styles from './AdminResults.module.css'

/** Normalize a score field for comparison: '' and null are the same thing. */
const norm = (v) => (v === '' || v == null ? null : Number(v))

export default function AdminResults() {
  const { data, loading, error, refetch } = useQueries({
    games: getGames, divisions: getDivisions,
  }, [])

  /** gameId -> { status, home_score, visitor_score }. Only edited games appear. */
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [divisionFilter, setDivisionFilter] = useState('')
  const [hideComplete, setHideComplete] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const dirtyIds = useMemo(() => Object.keys(drafts), [drafts])
  const isDirty = dirtyIds.length > 0

  /* --- Unsaved-changes guards (docs Section 4 and 8.6) -------------------- */

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty]
    )
  )

  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  /* ----------------------------------------------------------------------- */

  const valueFor = (game, key) =>
    drafts[game.id]?.[key] ?? (game[key] ?? (key === 'status' ? STATUS.TBP : ''))

  const edit = (game, key, value) => {
    setDrafts((prev) => {
      const current = prev[game.id] ?? {
        status: game.status,
        home_score: game.home_score ?? '',
        visitor_score: game.visitor_score ?? '',
      }
      const next = { ...current, [key]: value }

      // Leaving Final clears the scores, so a stale score can't linger behind a
      // cancelled or postponed status.
      if (key === 'status' && value !== STATUS.FINAL) {
        next.home_score = ''
        next.visitor_score = ''
      }

      // Typing both scores on a game that was merely awaiting a result marks it
      // Final on its own. Making someone set the status first, before the score
      // boxes would even accept input, is busywork.
      if (
        (key === 'home_score' || key === 'visitor_score') &&
        AWAITING_RESULT.has(next.status) &&
        next.home_score !== '' && next.visitor_score !== ''
      ) {
        next.status = STATUS.FINAL
      }

      const unchanged =
        next.status === game.status &&
        norm(next.home_score) === norm(game.home_score) &&
        norm(next.visitor_score) === norm(game.visitor_score)

      const copy = { ...prev }
      if (unchanged) delete copy[game.id]
      else copy[game.id] = next
      return copy
    })
  }

  /**
   * Flat, chronological list of games — one table row each.
   *
   * A table rather than matchup cards: score entry is a typing job, and a
   * single column of score inputs lets you tab straight down the sheet.
   */
  const rows = useMemo(() => {
    if (!data) return []
    let games = data.games
    if (divisionFilter) games = games.filter((g) => g.division_id === divisionFilter)
    if (hideComplete) {
      games = games.filter((g) => g.status !== STATUS.FINAL || drafts[g.id])
    }
    // Most recent game day first — you enter scores for the weekend just
    // played, so those rows belong at the top. Within a day, running order.
    return [...games].sort((a, b) =>
      b.game_date.localeCompare(a.game_date) ||
      (a.division?.sort_order ?? 0) - (b.division?.sort_order ?? 0) ||
      String(a.start_time ?? '').localeCompare(String(b.start_time ?? '')) ||
      String(a.field?.name ?? '').localeCompare(String(b.field?.name ?? '')) ||
      (a.game_number ?? 1) - (b.game_number ?? 1)
    )
  }, [data, divisionFilter, hideComplete, drafts])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const edits = Object.entries(drafts).map(([id, draft]) => ({
        id,
        status: draft.status,
        home_score: draft.status === STATUS.FINAL ? norm(draft.home_score) : null,
        visitor_score: draft.status === STATUS.FINAL ? norm(draft.visitor_score) : null,
      }))

      const incomplete = edits.filter(
        (e) => e.status === STATUS.FINAL && (e.home_score == null || e.visitor_score == null)
      )
      if (incomplete.length) {
        setNotice({
          tone: 'error',
          text: `${incomplete.length} game${incomplete.length > 1 ? 's are' : ' is'} marked Final but missing a score. Enter both scores, or change the status.`,
        })
        setSaving(false)
        return
      }

      const { saved, failures } = await saveGameResults(edits)

      if (failures.length === 0) {
        setDrafts({})
        setNotice({ tone: 'success', text: `Saved ${saved} game${saved === 1 ? '' : 's'}. Standings have been recalculated.` })
      } else {
        const failedIds = new Set(failures.map((f) => f.id))
        setDrafts((prev) => Object.fromEntries(
          Object.entries(prev).filter(([id]) => failedIds.has(id))
        ))
        setNotice({
          tone: 'error',
          text: `Saved ${saved}, but ${failures.length} failed: ${failures[0].error.message}`,
        })
      }
      refetch()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const discard = () => { setDrafts({}); setNotice(null) }

  const download = () => {
    if (!rows.length) return
    const scope = divisionFilter
      ? data.divisions.find((d) => d.id === divisionFilter)?.name.replace(/\s+/g, '-').toLowerCase()
      : 'all'
    downloadResultsCsv(rows, `kcsl-results-${scope}-${todayLocalISO()}.csv`)
    setNotice({
      tone: 'info',
      text: `Downloaded ${rows.length} game${rows.length === 1 ? '' : 's'}. Fill in the status and score columns, then use Upload scores.`,
    })
  }

  return (
    <div>
      <AdminPageHeader
        title="Game Results"
        description="One row per game. Edited rows are highlighted — nothing is written until you press Save all changes. For a long slate, download the sheet, fill it in offline, and upload it back."
      >
        <Button onClick={download} disabled={loading || !rows.length}>Download sheet</Button>
        <Button onClick={() => setImportOpen(true)} disabled={loading}>Upload scores</Button>
        {isDirty && <Button onClick={discard} disabled={saving}>Discard</Button>}
        <Button variant="primary" onClick={save} disabled={!isDirty || saving}>
          {saving ? 'Saving…' : `Save all changes${isDirty ? ` (${dirtyIds.length})` : ''}`}
        </Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {isDirty && !notice && (
        <Notice tone="warn">
          {dirtyIds.length} game{dirtyIds.length === 1 ? ' has' : 's have'} unsaved changes.
        </Notice>
      )}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <div className={styles.toolbar}>
            <div className={formStyles.field} style={{ minWidth: 180 }}>
              <label htmlFor="r-division">Division</label>
              <select id="r-division" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
                <option value="">All divisions</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <label className={styles.toggle}>
              <input type="checkbox" checked={hideComplete} onChange={(e) => setHideComplete(e.target.checked)} />
              Hide games already marked Final
            </label>
            <span className={styles.count}>
              {rows.length} game{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {rows.length === 0 && (
            <EmptyState title="Nothing to enter">
              {hideComplete
                ? 'Every game has a final score. Uncheck the filter above to edit one.'
                : 'No games on the schedule yet.'}
            </EmptyState>
          )}

          {rows.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colDate}>Date</th>
                    <th className={styles.colTime}>Time</th>
                    <th className={styles.colGame}>G</th>
                    <th>Visitor</th>
                    <th className={styles.colScore}>V</th>
                    <th className={styles.colScore}>H</th>
                    <th>Home</th>
                    <th className={styles.colStatus}>Status</th>
                    <th className={styles.colField}>Field</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((game) => {
                    const dirty = Boolean(drafts[game.id])
                    const status = valueFor(game, 'status')
                    // Editable for a final game, and for one still awaiting a
                    // result — entering the score is how it becomes final.
                    const scoresOn = status === STATUS.FINAL || AWAITING_RESULT.has(status)
                    const draftGame = {
                      ...game,
                      status,
                      home_score: norm(valueFor(game, 'home_score')),
                      visitor_score: norm(valueFor(game, 'visitor_score')),
                    }
                    const visitorResult = scoresOn ? deriveResult(draftGame, 'visitor') : null

                    return (
                      <tr key={game.id} className={dirty ? styles.dirty : undefined}>
                        <td className={styles.colDate}>{formatDate(game.game_date)}</td>
                        <td className={styles.colTime}>{formatTime(game.start_time) || '—'}</td>
                        <td className={styles.colGame}>{game.game_number ?? 1}</td>

                        <td className={styles.teamCell}>
                          {game.visitor_team?.name}
                          {visitorResult === 'W' && <span className={styles.winDot} title="Wins this game">▲</span>}
                        </td>

                        <td className={styles.colScore}>
                          <input
                            type="number"
                            min="0"
                            className={styles.scoreInput}
                            value={valueFor(game, 'visitor_score')}
                            onChange={(e) => edit(game, 'visitor_score', e.target.value)}
                            disabled={!scoresOn}
                            aria-label={`Visitor score, ${game.visitor_team?.name} at ${game.home_team?.name}`}
                          />
                        </td>
                        <td className={styles.colScore}>
                          <input
                            type="number"
                            min="0"
                            className={styles.scoreInput}
                            value={valueFor(game, 'home_score')}
                            onChange={(e) => edit(game, 'home_score', e.target.value)}
                            disabled={!scoresOn}
                            aria-label={`Home score, ${game.visitor_team?.name} at ${game.home_team?.name}`}
                          />
                        </td>

                        <td className={styles.teamCell}>
                          {game.home_team?.name}
                          {visitorResult === 'L' && <span className={styles.winDot} title="Wins this game">▲</span>}
                          {visitorResult === 'T' && <span className={styles.tieFlag}>tie</span>}
                        </td>

                        <td className={styles.colStatus}>
                          <select
                            className={styles.statusSelect}
                            value={status}
                            onChange={(e) => edit(game, 'status', e.target.value)}
                            aria-label={`Status, ${game.visitor_team?.name} at ${game.home_team?.name}`}
                          >
                            {STATUS_ORDER.map((s) => (
                              <option key={s} value={s}>{STATUS_META[s].tableLabel}</option>
                            ))}
                          </select>
                        </td>

                        <td className={styles.colField} title={game.field?.name}>{game.field?.name}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <CsvImport
        open={importOpen}
        title="Upload scores"
        template="game_id,game_date,start_time,division,visitor_team,home_team,field,status,visitor_score,home_score"
        sample={
          '# Use "Download sheet" to get this file with your games already in it.\n' +
          '# Edit only the status, visitor_score and home_score columns.\n' +
          '# Leave game_id exactly as it is — it is how each row is matched.'
        }
        onImport={(file) => importResultsCsv(file, { games: data.games })}
        onSuccess={() => { setDrafts({}); refetch() }}
        onClose={() => setImportOpen(false)}
      />

      {/* Confirmation when navigating away with unsaved edits (docs 8.6). */}
      <Modal
        open={blocker.state === 'blocked'}
        title="You have unsaved changes"
        onClose={() => blocker.reset?.()}
        width={440}
        footer={
          <>
            <Button onClick={() => blocker.reset?.()}>Stay on this page</Button>
            <Button variant="danger" onClick={() => { setDrafts({}); blocker.proceed?.() }}>
              Leave and discard
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          {dirtyIds.length} game{dirtyIds.length === 1 ? '' : 's'} still {dirtyIds.length === 1 ? 'has' : 'have'} edits
          that haven’t been saved. Leaving now discards them.
        </p>
      </Modal>
    </div>
  )
}
