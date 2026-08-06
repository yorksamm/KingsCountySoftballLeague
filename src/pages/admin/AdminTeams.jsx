import { useMemo, useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import CsvImport from '../../components/admin/CsvImport.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getTeams, getDivisions, getGames } from '../../lib/api.js'
import { createTeam, updateTeam, deleteTeam, importTeamsCsv } from '../../lib/adminApi.js'
import formStyles from '../../styles/form.module.css'

const BLANK = { name: '', division_id: '', contact_name: '', contact_email: '', is_active: true }

export default function AdminTeams() {
  const { data, loading, error, refetch } = useQueries({
    teams: getTeams, divisions: getDivisions, games: getGames,
  }, [])

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [divisionFilter, setDivisionFilter] = useState('')

  const gamesByTeam = useMemo(() => {
    const counts = new Map()
    for (const g of data?.games ?? []) {
      counts.set(g.home_team_id, (counts.get(g.home_team_id) ?? 0) + 1)
      counts.set(g.visitor_team_id, (counts.get(g.visitor_team_id) ?? 0) + 1)
    }
    return counts
  }, [data])

  const rows = useMemo(() => {
    const teams = data?.teams ?? []
    return (divisionFilter ? teams.filter((t) => t.division_id === divisionFilter) : teams)
  }, [data, divisionFilter])

  const open = (row) => {
    setEditing(row ?? BLANK)
    setForm(row
      ? {
          name: row.name,
          division_id: row.division_id,
          contact_name: row.contact_name ?? '',
          contact_email: row.contact_email ?? '',
          is_active: row.is_active !== false,
        }
      : { ...BLANK, division_id: data?.divisions?.[0]?.id ?? '' })
    setSaveError(null)
  }

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const payload = {
        name: form.name.trim(),
        division_id: form.division_id,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        is_active: form.is_active,
      }
      if (editing?.id) await updateTeam(editing.id, payload)
      else await createTeam(payload)
      setEditing(null)
      setNotice({ tone: 'success', text: 'Team saved.' })
      refetch()
    } catch (err) {
      setSaveError(err.code === '23505' ? 'A team with that name already exists.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteTeam(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Team deleted.' })
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
      key: 'name',
      label: 'Team',
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
          <strong>{row.name}</strong>
          {row.is_active === false && <Badge tone="out">out</Badge>}
        </span>
      ),
    },
    { key: 'division', label: 'Division', render: (row) => row.division?.name ?? '—' },
    {
      key: 'contact',
      label: 'Contact',
      render: (row) => row.contact_name
        ? (row.contact_email
            ? <a href={`mailto:${row.contact_email}`}>{row.contact_name}</a>
            : row.contact_name)
        : <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    { key: 'games', label: 'Games', align: 'right', render: (row) => gamesByTeam.get(row.id) ?? 0 },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Teams"
        description="Team names must match your CSV files exactly. Renaming a team later is safe — games reference the team by its internal ID, so past results are never orphaned."
      >
        <Button onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button variant="primary" onClick={() => open(null)}>New team</Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-end', marginBottom: '1rem', maxWidth: 280 }}>
            <div className={formStyles.field} style={{ flex: 1 }}>
              <label htmlFor="t-filter">Filter by division</label>
              <select id="t-filter" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
                <option value="">All divisions</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <AdminTable
            columns={columns}
            rows={rows}
            empty="No teams yet. Add one, or import a CSV."
            renderActions={(row) => (
              <>
                <Button size="sm" onClick={() => open(row)}>Edit</Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirm(row)}
                  disabled={(gamesByTeam.get(row.id) ?? 0) > 0}
                  title={(gamesByTeam.get(row.id) ?? 0) > 0
                    ? 'This team has scheduled games. Mark it inactive instead.'
                    : undefined}
                >
                  Delete
                </Button>
              </>
            )}
          />
        </>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Edit team' : 'New team'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || !form.name.trim() || !form.division_id}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="tm-name">Name</label>
              <input
                id="tm-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="GATORS"
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="tm-division">Division</label>
              <select
                id="tm-division"
                value={form.division_id}
                onChange={(e) => setForm({ ...form, division_id: e.target.value })}
              >
                <option value="">Select a division…</option>
                {data?.divisions?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div className={formStyles.row}>
            <div className={formStyles.field}>
              <label htmlFor="tm-contact">Contact name <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <input
                id="tm-contact"
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />
            </div>
            <div className={formStyles.field}>
              <label htmlFor="tm-email">Contact email <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <input
                id="tm-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              />
            </div>
          </div>

          <label className={formStyles.checkbox}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span className={formStyles.checkboxText}>
              <span className={formStyles.checkboxLabel}>Active</span>
              <span className={formStyles.hint}>
                Uncheck when a team withdraws mid-season. Its played games and standings
                position are kept; it is just flagged “out” and hidden from new-game dropdowns.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete team"
        message={`Delete "${confirm?.name}"? This cannot be undone.`}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />

      <CsvImport
        open={importOpen}
        title="Import teams from CSV"
        template="name,division,contact_name,contact_email"
        templateFilename="kcsl-teams-template.csv"
        sample={'GATORS,B 2026,,\nHEAT,B 2026,Jane Smith,jane@email.com\nMACHINE,B 2026,,'}
        onImport={(file) => importTeamsCsv(file, { divisions: data.divisions, teams: data.teams })}
        onSuccess={refetch}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
