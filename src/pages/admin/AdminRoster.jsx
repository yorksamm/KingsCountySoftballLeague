import { useMemo, useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import CsvImport from '../../components/admin/CsvImport.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getPlayers, getTeams, getDivisions } from '../../lib/api.js'
import { createPlayer, updatePlayer, deletePlayer, importRosterCsv } from '../../lib/adminApi.js'
import { byJersey } from '../../lib/roster.js'
import formStyles from '../../styles/form.module.css'

const BLANK = { name: '', jersey_number: '', team_id: '' }

export default function AdminRoster() {
  const { data, loading, error, refetch } = useQueries({
    players: getPlayers, teams: getTeams, divisions: getDivisions,
  }, [])

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)
  const [importOpen, setImportOpen] = useState(false)

  const [divisionFilter, setDivisionFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [search, setSearch] = useState('')

  const teamOptions = useMemo(() => {
    const teams = data?.teams ?? []
    return divisionFilter ? teams.filter((t) => t.division_id === divisionFilter) : teams
  }, [data, divisionFilter])

  const rows = useMemo(() => {
    let list = data?.players ?? []
    if (divisionFilter) list = list.filter((p) => p.team?.division_id === divisionFilter)
    if (teamFilter) list = list.filter((p) => p.team_id === teamFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      String(a.team?.name ?? '').localeCompare(String(b.team?.name ?? '')) || byJersey(a, b)
    )
  }, [data, divisionFilter, teamFilter, search])

  const countsByTeam = useMemo(() => {
    const counts = new Map()
    for (const p of data?.players ?? []) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1)
    return counts
  }, [data])

  const open = (row) => {
    setEditing(row ?? BLANK)
    setForm(row
      ? { name: row.name, jersey_number: row.jersey_number ?? '', team_id: row.team_id }
      : { ...BLANK, team_id: teamFilter || teamOptions[0]?.id || '' })
    setSaveError(null)
  }

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const jersey = form.jersey_number.trim()
      if (jersey && !/^\d{1,3}$/.test(jersey)) {
        throw new Error('Jersey number should be digits only, or left blank.')
      }
      const payload = {
        team_id: form.team_id,
        name: form.name.trim(),
        jersey_number: jersey || null,
      }
      if (editing?.id) await updatePlayer(editing.id, payload)
      else await createPlayer(payload)
      setEditing(null)
      setNotice({ tone: 'success', text: 'Player saved.' })
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
      await deletePlayer(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Player removed.' })
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
      key: 'jersey_number',
      label: '#',
      align: 'center',
      width: '60px',
      render: (row) => row.jersey_number
        ? <span className="num" style={{ fontWeight: 700 }}>{row.jersey_number}</span>
        : <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    { key: 'name', label: 'Player', render: (row) => <strong>{row.name}</strong> },
    {
      key: 'team',
      label: 'Team',
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
          {row.team?.name ?? '—'}
          {row.team?.is_active === false && <Badge tone="out">out</Badge>}
        </span>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Rosters"
        description="Players shown on the public Teams page — each team's roster opens from its card, and there's a searchable list of everyone in the league. Jersey numbers are optional and unique within a team."
      >
        <Button onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button variant="primary" onClick={() => open(null)} disabled={!data?.teams?.length}>
          Add player
        </Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div className={formStyles.field} style={{ minWidth: 170 }}>
              <label htmlFor="r-division">Division</label>
              <select
                id="r-division"
                value={divisionFilter}
                onChange={(e) => { setDivisionFilter(e.target.value); setTeamFilter('') }}
              >
                <option value="">All divisions</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className={formStyles.field} style={{ minWidth: 190 }}>
              <label htmlFor="r-team">Team</label>
              <select id="r-team" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                <option value="">All teams</option>
                {teamOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({countsByTeam.get(t.id) ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className={formStyles.field} style={{ minWidth: 190 }}>
              <label htmlFor="r-search">Search by name</label>
              <input
                id="r-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing a name…"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button
                variant="ghost"
                onClick={() => { setDivisionFilter(''); setTeamFilter(''); setSearch('') }}
                disabled={!divisionFilter && !teamFilter && !search}
              >
                Clear
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto',
                          color: 'var(--ink-mute)', fontSize: '.8125rem', paddingBottom: '.5rem' }}>
              {rows.length} player{rows.length === 1 ? '' : 's'}
            </div>
          </div>

          <AdminTable
            columns={columns}
            rows={rows}
            empty={
              (data?.players?.length ?? 0) === 0
                ? 'No players yet. Add them one at a time, or import a CSV — the import dialog has a blank template to start from.'
                : 'No players match these filters.'
            }
            renderActions={(row) => (
              <>
                <Button size="sm" onClick={() => open(row)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirm(row)}>Remove</Button>
              </>
            )}
          />
        </>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Edit player' : 'Add player'}
        onClose={() => setEditing(null)}
        width={520}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || !form.name.trim() || !form.team_id}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}

          <div className={formStyles.field}>
            <label htmlFor="p-team">Team</label>
            <select
              id="p-team"
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
            >
              <option value="">Select a team…</option>
              {data?.teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.is_active === false ? ' (out)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={formStyles.row}>
            <div className={formStyles.field} style={{ flex: '2 1 220px' }}>
              <label htmlFor="p-name">Player name</label>
              <input
                id="p-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mike Torres"
              />
            </div>
            <div className={formStyles.field} style={{ flex: '0 1 120px' }}>
              <label htmlFor="p-jersey">Jersey #</label>
              <input
                id="p-jersey"
                type="text"
                inputMode="numeric"
                value={form.jersey_number}
                onChange={(e) => setForm({ ...form, jersey_number: e.target.value })}
                placeholder="12"
              />
              <span className={formStyles.hint}>Optional. “00” is kept as written.</span>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Remove player"
        message={`Remove ${confirm?.name} from ${confirm?.team?.name}? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />

      <CsvImport
        open={importOpen}
        title="Import rosters from CSV"
        template="team,name,jersey_number"
        templateFilename="kcsl-roster-template.csv"
        sample={'GATORS,Mike Torres,12\nGATORS,Anthony Ruiz,7\nHEAT,Danny Alvarez,'}
        onImport={(file) => importRosterCsv(file, { teams: data.teams, players: data.players })}
        onSuccess={refetch}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
