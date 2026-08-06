import { useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getDivisions, getTeams, getGames } from '../../lib/api.js'
import { createDivision, updateDivision, deleteDivision, reorderDivisions } from '../../lib/adminApi.js'
import formStyles from '../../styles/form.module.css'

export default function AdminDivisions() {
  const { data, loading, error, refetch } = useQueries({
    divisions: getDivisions, teams: getTeams, games: getGames,
  }, [])

  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)

  const teamCount = (divisionId) => (data?.teams ?? []).filter((t) => t.division_id === divisionId).length
  const gameCount = (divisionId) => (data?.games ?? []).filter((g) => g.division_id === divisionId).length

  const open = (row) => {
    setEditing(row ?? {})
    setName(row?.name ?? '')
    setSaveError(null)
  }

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      if (editing?.id) await updateDivision(editing.id, { name: name.trim() })
      else await createDivision({ name: name.trim(), sort_order: (data?.divisions?.length ?? 0) + 1 })
      setEditing(null)
      setNotice({ tone: 'success', text: 'Division saved.' })
      refetch()
    } catch (err) {
      setSaveError(err.code === '23505' ? 'A division with that name already exists.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteDivision(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Division deleted.' })
      refetch()
    } catch (err) {
      setConfirm(null)
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const handleReorder = async (orderedIds) => {
    try {
      await reorderDivisions(orderedIds)
      setNotice({ tone: 'success', text: 'Order saved.' })
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not save the new order: ${err.message}` })
      refetch()
    }
  }

  const columns = [
    { key: 'name', label: 'Division', render: (row) => <strong>{row.name}</strong> },
    { key: 'teams', label: 'Teams', align: 'right', render: (row) => teamCount(row.id) },
    { key: 'games', label: 'Games', align: 'right', render: (row) => gameCount(row.id) },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Divisions"
        description="Drag the handle (or focus it and press ↑ / ↓) to change the order divisions appear in throughout the app. The season is part of the name — e.g. “B 2026”."
      >
        <Button variant="primary" onClick={() => open(null)}>New division</Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <AdminTable
          columns={columns}
          rows={data?.divisions ?? []}
          onReorder={handleReorder}
          empty="No divisions yet. Add one before creating teams."
          renderActions={(row) => (
            <>
              <Button size="sm" onClick={() => open(row)}>Rename</Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirm(row)}
                disabled={teamCount(row.id) > 0 || gameCount(row.id) > 0}
                title={
                  teamCount(row.id) > 0 || gameCount(row.id) > 0
                    ? 'Cannot delete while teams or games reference this division'
                    : undefined
                }
              >
                Delete
              </Button>
            </>
          )}
        />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Rename division' : 'New division'}
        onClose={() => setEditing(null)}
        width={440}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}
          <div className={formStyles.field}>
            <label htmlFor="d-name">Name</label>
            <input
              id="d-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="B 2026"
            />
            <span className={formStyles.hint}>
              Must match your CSV files exactly, including capitalization and spacing.
              Renaming is safe — games reference the division by ID, not by name.
            </span>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete division"
        message={`Delete "${confirm?.name}"? This cannot be undone.`}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  )
}
