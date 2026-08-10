import { useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import AdminTable from '../../components/admin/AdminTable.jsx'
import Modal, { ConfirmModal } from '../../components/ui/Modal.jsx'
import RichTextEditor from '../../components/admin/RichTextEditor.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { toPlainText } from '../../lib/richText.jsx'
import { markdownToDoc, docToPlainText, isEmptyDoc, normalizeDoc } from '../../lib/richDoc.jsx'
import { useQuery } from '../../hooks/useQuery.js'
import {
  getAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
} from '../../lib/adminApi.js'
import formStyles from '../../styles/form.module.css'

const EMPTY_DOC = { v: 1, blocks: [] }
const BLANK = { title: '', body_doc: EMPTY_DOC, active: true, pinned: false }

export default function AdminAnnouncements() {
  const { data, loading, error, refetch } = useQuery(getAllAnnouncements, [])
  const [editing, setEditing] = useState(null)     // null | BLANK | row
  const [form, setForm] = useState(BLANK)
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(null)

  const open = (row) => {
    setEditing(row ?? BLANK)
    setForm(row
      ? {
          title: row.title,
          // Announcements written before the editor became WYSIWYG only have
          // the old marker text. Convert on open so they can be edited, and
          // they'll be stored as a document the next time they're saved.
          body_doc: row.body_doc
            ? normalizeDoc(row.body_doc)
            : markdownToDoc(row.body ?? ''),
          active: row.active,
          pinned: row.pinned,
        }
      : BLANK)
    setSaveError(null)
  }

  const save = async () => {
    setBusy(true)
    setSaveError(null)
    try {
      const doc = normalizeDoc(form.body_doc)
      const payload = {
        title: form.title,
        active: form.active,
        pinned: form.pinned,
        body_doc: isEmptyDoc(doc) ? null : doc,
        // The legacy column is cleared on save so there is exactly one source
        // of truth per announcement, never a stale copy rendering instead.
        body: null,
      }
      if (editing?.id) await updateAnnouncement(editing.id, payload)
      else await createAnnouncement(payload)
      setEditing(null)
      setNotice({ tone: 'success', text: editing?.id ? 'Announcement updated.' : 'Announcement created.' })
      refetch()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** Quick toggle straight from the table — the common case is switching one off. */
  const toggle = async (row, key) => {
    try {
      await updateAnnouncement(row.id, { [key]: !row[key] })
      refetch()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteAnnouncement(confirm.id)
      setConfirm(null)
      setNotice({ tone: 'success', text: 'Announcement deleted.' })
      refetch()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (row) => (
        <div>
          <strong>{row.title}</strong>
          {(row.body_doc || row.body) && (
            <div style={{ fontSize: '.75rem', color: 'var(--ink-soft)', marginTop: '.15rem' }}>
              {row.body_doc ? docToPlainText(row.body_doc, 120) : toPlainText(row.body, 120)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'active',
      label: 'Published',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => toggle(row, 'active')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
          title={row.active ? 'On the home page — click to unpublish' : 'Not published — click to publish'}
        >
          <Badge tone={row.active ? 'final' : 'neutral'}>{row.active ? 'LIVE' : 'OFF'}</Badge>
        </button>
      ),
    },
    {
      key: 'pinned',
      label: 'Important',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => toggle(row, 'pinned')}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: '1rem',
                   color: row.pinned ? 'var(--clay)' : 'var(--line)' }}
          title={row.pinned ? 'Shown in the site banner — click to remove' : 'Click to mark important and show in the banner'}
        >
          ★
        </button>
      ),
    },
  ]

  return (
    <div>
      <AdminPageHeader
        title="Announcements"
        description="Published announcements are the body of the home page, newest first. Marking one Important also puts it in the orange banner on every page. Unpublished announcements aren't readable by the public at all — that's enforced by a database policy, not just hidden in the UI."
      >
        <Button variant="primary" onClick={() => open(null)}>New announcement</Button>
      </AdminPageHeader>

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <AdminTable
          columns={columns}
          rows={data ?? []}
          empty="No announcements yet."
          renderActions={(row) => (
            <>
              <Button size="sm" onClick={() => open(row)}>Edit</Button>
              <Button size="sm" variant="danger" onClick={() => setConfirm(row)}>Delete</Button>
            </>
          )}
        />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? 'Edit announcement' : 'New announcement'}
        onClose={() => setEditing(null)}
        width={760}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className={formStyles.form}>
          {saveError && <div className={formStyles.error}>{saveError}</div>}

          <div className={formStyles.field}>
            <label htmlFor="a-title">Title</label>
            <input
              id="a-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Rainout — all Sunday games cancelled"
            />
            <span className={formStyles.hint}>Displayed in bold in the banner and as the post heading.</span>
          </div>

          <div className={formStyles.field}>
            <label htmlFor="a-body">Body</label>
            <RichTextEditor
              id="a-body"
              value={form.body_doc}
              onChange={(body_doc) => setForm({ ...form, body_doc })}
              placeholder={
                'Write the announcement here. Select some text and use the ' +
                'buttons above to make it a heading, bold, coloured, a list, ' +
                'or a link — what you see here is what the home page shows.'
              }
            />
          </div>

          <label className={formStyles.checkbox}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span className={formStyles.checkboxText}>
              <span className={formStyles.checkboxLabel}>Published</span>
              <span className={formStyles.hint}>
                Shows on the home page. Uncheck to take it down without deleting it —
                unpublished announcements aren’t readable by the public at all.
              </span>
            </span>
          </label>

          <label className={formStyles.checkbox}>
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            <span className={formStyles.checkboxText}>
              <span className={formStyles.checkboxLabel}>Important</span>
              <span className={formStyles.hint}>
                Moves it to the top of the home page <em>and</em> shows it in the orange
                banner on every page. Use it for things people need to see today —
                rainouts, deadlines. Only the newest important announcement is bannered.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(confirm)}
        title="Delete announcement"
        message={`Delete "${confirm?.title}"? This cannot be undone. To hide it temporarily, switch it to inactive instead.`}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  )
}
