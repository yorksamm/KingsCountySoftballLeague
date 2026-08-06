import { useMemo, useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import CsvImport from '../../components/admin/CsvImport.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { StatusBadge } from '../../components/ui/Badge.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getGames, getTeams, getFields, getDivisions } from '../../lib/api.js'
import { createGame, updateGame, deleteGame, importScheduleCsv } from '../../lib/adminApi.js'
import { STATUS, STATUS_ORDER, STATUS_META } from '../../lib/constants.js'
import { formatDate, formatTime, toTimeInput, todayLocalISO } from '../../lib/format.js'
import formStyles from '../../styles/form.module.css'

const BLANK = {
  game_date: todayLocalISO(),
  start_time: '09:00',
  division_id: '',
  home_team_id: '',
  visitor_team_id: '',
  field_id: '',
  status: STATUS.TBP,
  home_score: '',
  visitor_score: '',
  notes: '',
}

export default function AdminSchedule() {
  const { data, loading, error, refetch } = useQueries({
    games: getGames, teams: getTeams, fields: getFields, divisions: getDivisions,
  }, [])

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const [divisionFilter, setDivisionFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const rows = useMemo(() => {
    let list = data?.games ?? []
    if (divisionFilter) list = list.filter((g) => g.division_id === divisionFilter)
    if (dateFilter) list = list.filter((g) => g.game_date === dateFilter)
    // Most recent game day first; within a day, normal running order.
    return [...list].sort((a, b) =>
      b.game_date.localeCompare(a.game_date) ||
      (a.division?.sort_order ?? 0) - (b.division?.sort_order ?? 0) ||
      String(a.start_time ?? '').localeCompare(String(b.start_time ?? '')) ||
      String(a.field?.name ?? '').localeCompare(String(b.field?.name ?? '')) ||
      (a.game_number ?? 1) - (b.game_number ?? 1)
    )
  }, [data, divisionFilter, dateFilter])

  const gameDates = useMemo(
    () => [...new Set((data?.games ?? []).map((g) => g.game_date))].sort().reverse(),
    [data]
  )

  /** Inactive teams stay selectable when already on the game being edited. */
  const teamOptions = (currentId) =>
    (data?.teams ?? []).filter((t) => t.is_active !== false || t.id === currentId)

  const open = (row) => {
    setEditing(row ?? BLANK)
    setForm(row
      ? {
          game_date: row.game_date,
          start_time: toTimeInput(row.start_time),
          division_id: row.division_id,
          home_team_id: row.home_team_id,
          visitor_team_id: row.visitor_team_id,
          field_id: row.field_id,
          status: row.status,
          home_score: row.home_score ?? '',
          visitor_score: row.visitor_score ?? '',
          notes: row.notes ?? '',
        }
      : { ...BLANK, division_id: data?.divisions?.[0]?.id ?? '' })
    setSaveError(null)
  }

  const isFinal = form.status === STATUS.FINAL

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const payload = {
        game_date: form.game_date,
        start_time: form.start_time || null,
        division_id: form.division_id,
        home_team_id: form.home_team_id,
        visitor_team_id: form.visitor_team_id,
        field_id: form.field_id,
        status: form.status,
        // Only a final game carries a score. Clearing it on any other status
        // stops a legacy 0-0 from surviving a status change.
        home_score: isFinal && form.home_score !== '' ? Number(form.home_score) : null,
        visitor_score: isFinal && form.visitor_score !== '' ? Number(form.visitor_score) : null,
        notes: form.notes.trim() || null,
      }

      if (isFinal && (payload.home_score == null || payload.visitor_score == null)) {
        throw new Error('A game marked Final needs both a home and a visitor score.')
      }
      if (payload.home_team_id === payload.visitor_team_id) {
        throw new Error('Home and visitor cannot be the same team.')
      }

      if (editing?.id) await updateGame(editing.id, payload)
      else await createGame(payload)

      setEditing(null)
      setNotice({ tone: 'success', text: 'Game saved.' })
      refetch()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteGame(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Game deleted.' })
      refetch()
    } catch (err) {
      setConfirm(null)
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'game_date',
      label: 'Date',
      render: (row) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          <strong>{formatDate(row.game_date)}</strong>
          <span style={{ color: 'var(--ink-mute)', marginLeft: '.4rem', fontSize: '.75rem' }}>
            {formatTime(row.start_time)}
          </span>
        </span>
      ),
    },
    { key: 'game_number', label: 'G', align: 'center', render: (row) => row.game_number ?? 1 },
    { key: 'division', label: 'Division', render: (row) => row.division?.name ?? '—' },
    {
      key: 'matchup',
      label: 'Visitor at Home',
      render: (row) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {row.visitor_team?.name} <span style={{ color: 'var(--ink-mute)' }}>at</span> {row.home_team?.name}
        </span>
      ),
    },
    { key: 'field', label: 'Field', render: (row) => row.field?.name ?? '—' },
    {
      key: 'score',
      label: 'V – H',
      align: 'center',
      render: (row) => row.status === STATUS.FINAL && row.visitor_score != null
        ? <span className="num">{row.visitor_score} – {row.home_score}</span>
        : <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    { key: 'status', label: 'Status', align: 'center', render: (row) => <StatusBadge status={row.status} /> },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Schedule"
        description="One row per game. Two rows sharing the same date, field, and pair of teams form a double header — a third is rejected automatically, and swapping who is home in Game 2 is allowed."
      >
        <Button onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button variant="primary" onClick={() => open(null)}>New game</Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className={formStyles.field} style={{ minWidth: 180 }}>
              <label htmlFor="s-division">Division</label>
              <select id="s-division" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
                <option value="">All divisions</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className={formStyles.field} style={{ minWidth: 180 }}>
              <label htmlFor="s-date">Game day</label>
              <select id="s-date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                <option value="">All dates</option>
                {gameDates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => { setDivisionFilter(''); setDateFilter('') }}
                disabled={!divisionFilter && !dateFilter}
              >
                Clear
              </Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto', color: 'var(--ink-mute)', fontSize: '.8125rem' }}>
              {rows.length} game{rows.length === 1 ? '' : 's'}
            </div>
          </div>

          <AdminTable
            columns={columns}
            rows={rows}
            empty="No games match these filters."
            renderActions={(row) => (
              <>
                <Button size="sm" onClick={() => open(row)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm(row)}>Delete</Button>
              </>
            )}
          />
        </>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Edit game' : 'New game'}
        onClose={() => setEditing(null)}
        width={640}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={busy || !form.division_id || !form.home_team_id || !form.visitor_team_id || !form.field_id || !form.game_date}
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="g-date">Date</label>
              <input id="g-date" type="date" value={form.game_date}
                     onChange={(e) => setForm({ ...form, game_date: e.target.value })} />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="g-time">Start time</label>
              <input id="g-time" type="time" value={form.start_time}
                     onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              <span className={formStyles.hint}>Game 2 of a header is its own row.</span>
            </div>
            <div className={formStyles.field}>
              <label htmlFor="g-division">Division</label>
              <select id="g-division" value={form.division_id}
                      onChange={(e) => setForm({ ...form, division_id: e.target.value })}>
                <option value="">Select…</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <hr className={formStyles.divider} />

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="g-visitor">Visitor team</label>
              <select id="g-visitor" value={form.visitor_team_id}
                      onChange={(e) => setForm({ ...form, visitor_team_id: e.target.value })}>
                <option value="">Select…</option>
                {teamOptions(form.visitor_team_id).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? ' (out)' : ''}</option>
                ))}
              </select>
            </div>
            <div className={formStyles.field}>
              <label htmlFor="g-home">Home team</label>
              <select id="g-home" value={form.home_team_id}
                      onChange={(e) => setForm({ ...form, home_team_id: e.target.value })}>
                <option value="">Select…</option>
                {teamOptions(form.home_team_id).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_active === false ? ' (out)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={formStyles.field}>
            <label htmlFor="g-field">Field</label>
            <select id="g-field" value={form.field_id}
                    onChange={(e) => setForm({ ...form, field_id: e.target.value })}>
              <option value="">Select…</option>
              {data?.fields?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <hr className={formStyles.divider} />

          <div className={formStyles.field}>
            <label htmlFor="g-status">Status</label>
            <select id="g-status" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].adminLabel}</option>
              ))}
            </select>
          </div>

          {isFinal && (
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <label htmlFor="g-vscore">Visitor score</label>
                <input id="g-vscore" type="number" min="0" value={form.visitor_score}
                       onChange={(e) => setForm({ ...form, visitor_score: e.target.value })} />
              </div>
              <div className={formStyles.field}>
                <label htmlFor="g-hscore">Home score</label>
                <input id="g-hscore" type="number" min="0" value={form.home_score}
                       onChange={(e) => setForm({ ...form, home_score: e.target.value })} />
                <span className={formStyles.hint}>Equal scores record a tie for both teams.</span>
              </div>
            </div>
          )}

          <div className={formStyles.field}>
            <label htmlFor="g-notes">Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <textarea id="g-notes" value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Makeup game from June 14." />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete game"
        message={
          confirm
            ? `Delete ${confirm.visitor_team?.name} at ${confirm.home_team?.name} on ${formatDate(confirm.game_date)}? This cannot be undone.`
            : ''
        }
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />

      <CsvImport
        open={importOpen}
        title="Import schedule from CSV"
        template="game_date,start_time,division,home_team,visitor_team,field,status,home_score,visitor_score,notes"
        templateFilename="kcsl-schedule-template.csv"
        sample={
          '2026-06-21,09:00,B 2026,GATORS,HEAT,Marine Pk # 5,tbp,,,\n' +
          '2026-06-21,10:00,B 2026,GATORS,HEAT,Marine Pk # 5,tbp,,,\n' +
          '2026-06-21,09:00,B 2026,MACHINE,RIPPERZ,Marine Pk # 9,final,8,4,'
        }
        onImport={(file) => importScheduleCsv(file, {
          divisions: data.divisions, teams: data.teams, fields: data.fields, games: data.games,
        })}
        onSuccess={refetch}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
