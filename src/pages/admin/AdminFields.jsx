import { useMemo, useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { useQueries } from '../../hooks/useQuery.js'
import { getFields, getGames } from '../../lib/api.js'
import { createField, updateField, deleteField, reorderFields } from '../../lib/adminApi.js'
import formStyles from '../../styles/form.module.css'

const BLANK = { name: '', address: '', map_url: '', notes: '' }

export default function AdminFields() {
  const { data, loading, error, refetch } = useQueries({ fields: getFields, games: getGames }, [])

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)

  const gamesByField = useMemo(() => {
    const counts = new Map()
    for (const g of data?.games ?? []) counts.set(g.field_id, (counts.get(g.field_id) ?? 0) + 1)
    return counts
  }, [data])

  const open = (row) => {
    setEditing(row ?? BLANK)
    setForm(row
      ? { name: row.name, address: row.address ?? '', map_url: row.map_url ?? '', notes: row.notes ?? '' }
      : BLANK)
    setSaveError(null)
  }

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        map_url: form.map_url.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (editing?.id) await updateField(editing.id, payload)
      else await createField({ ...payload, sort_order: (data?.fields?.length ?? 0) + 1 })
      setEditing(null)
      setNotice({ tone: 'success', text: 'Field saved.' })
      refetch()
    } catch (err) {
      setSaveError(err.code === '23505' ? 'A field with that name already exists.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteField(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Field deleted.' })
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
      await reorderFields(orderedIds)
      setNotice({ tone: 'success', text: 'Order saved.' })
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not save the new order: ${err.message}` })
      refetch()
    }
  }

  const columns = [
    { key: 'name', label: 'Field', render: (row) => <strong>{row.name}</strong> },
    {
      key: 'address',
      label: 'Address',
      render: (row) => row.address ?? <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    {
      key: 'map_url',
      label: 'Map',
      align: 'center',
      render: (row) => row.map_url
        ? <a href={row.map_url} target="_blank" rel="noopener noreferrer">Open ↗</a>
        : <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    {
      key: 'notes',
      label: 'Notes',
      render: (row) => row.notes
        ? <span style={{ fontSize: '.75rem', color: 'var(--ink-soft)' }}>{row.notes}</span>
        : <span style={{ color: 'var(--ink-mute)' }}>—</span>,
    },
    { key: 'games', label: 'Games', align: 'right', render: (row) => gamesByField.get(row.id) ?? 0 },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Fields"
        description="Notes appear on the public game cards — parking, entrances, landmarks. Drag the handle (or press ↑ / ↓ on it) to change the order fields appear in dropdowns."
      >
        <Button variant="primary" onClick={() => open(null)}>New field</Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <AdminTable
          columns={columns}
          rows={data?.fields ?? []}
          onReorder={handleReorder}
          empty="No fields yet. Add one before scheduling games."
          renderActions={(row) => (
            <>
              <Button size="sm" onClick={() => open(row)}>Edit</Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirm(row)}
                disabled={(gamesByField.get(row.id) ?? 0) > 0}
                title={(gamesByField.get(row.id) ?? 0) > 0
                  ? 'Games are scheduled here — reassign them first'
                  : undefined}
              >
                Delete
              </Button>
            </>
          )}
        />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Edit field' : 'New field'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || !form.name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}

          <div className={formStyles.field}>
            <label htmlFor="f-name">Name</label>
            <input
              id="f-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Marine Pk # 5"
            />
            <span className={formStyles.hint}>
              Must match your schedule CSV exactly. Be consistent about spacing —
              “Marine Pk #5” and “Marine Pk # 5” are two different fields.
            </span>
          </div>

          <div className={formStyles.field}>
            <label htmlFor="f-address">Address</label>
            <input
              id="f-address"
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Avenue U and Stuart Street, Brooklyn, NY"
            />
          </div>

          <div className={formStyles.field}>
            <label htmlFor="f-map">Map URL</label>
            <input
              id="f-map"
              type="url"
              value={form.map_url}
              onChange={(e) => setForm({ ...form, map_url: e.target.value })}
              placeholder="https://maps.google.com/…"
            />
            <span className={formStyles.hint}>Google or Apple Maps link. Opens in a new tab from the game card.</span>
          </div>

          <div className={formStyles.field}>
            <label htmlFor="f-notes">Notes</label>
            <textarea
              id="f-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Street parking, or use the Avenue S lot. Enter past the school."
            />
            <span className={formStyles.hint}>Shown to players on every game card for this field.</span>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete field"
        message={`Delete "${confirm?.name}"? This cannot be undone.`}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  )
}
