import { useRef, useState } from 'react'
import AdminPageHeader, { Notice } from '../../components/admin/AdminPageHeader.jsx'
import Button from '../../components/ui/Button.jsx'
import Spinner, { ErrorState } from '../../components/ui/Spinner.jsx'
import { ConfirmModal } from '../../components/ui/Modal.jsx'
import { useQuery } from '../../hooks/useQuery.js'
import { getRulesDocument } from '../../lib/api.js'
import { uploadRulesPdf, clearRulesPdf, RULES_MAX_BYTES } from '../../lib/adminApi.js'
import styles from './AdminRules.module.css'

export default function AdminRules() {
  const { data, loading, error, refetch } = useQuery(getRulesDocument, [])
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const pick = (selected) => {
    setNotice(null)
    if (!selected) { setFile(null); return }

    // Mirrors the Storage bucket policy — the bucket enforces the same limits
    // server-side, so this is only here to fail fast with a clear message.
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setNotice({ tone: 'error', text: 'Only PDF files can be uploaded.' })
      setFile(null)
      return
    }
    if (selected.size > RULES_MAX_BYTES) {
      setNotice({ tone: 'error', text: `That file is ${(selected.size / 1024 / 1024).toFixed(1)}MB. The limit is 20MB.` })
      setFile(null)
      return
    }
    setFile(selected)
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      await uploadRulesPdf(file)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      setNotice({ tone: 'success', text: 'Rules PDF published. The public Rules page now links to this file.' })
      refetch()
    } catch (err) {
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearRulesPdf()
      setConfirmClear(false)
      setNotice({ tone: 'success', text: 'Rules PDF removed. The public Rules page now shows an empty state.' })
      refetch()
    } catch (err) {
      setConfirmClear(false)
      setNotice({ tone: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Rules PDF"
        description="One active rulebook at a time. Uploading a replacement swaps the public link immediately and deletes the previous file."
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      {loading && <Spinner />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Currently published</h2>
            {data?.public_url ? (
              <div className={styles.current}>
                <div className={styles.icon} aria-hidden="true">PDF</div>
                <div className={styles.currentText}>
                  <strong>{data.file_name || 'League Rules'}</strong>
                  <span className={styles.updated}>
                    Updated {data.updated_at ? new Date(data.updated_at).toLocaleString() : '—'}
                  </span>
                  <a href={data.public_url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                </div>
                <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)} disabled={busy}>
                  Remove
                </Button>
              </div>
            ) : (
              <p className={styles.none}>No rulebook is published. The public Rules page shows an empty state.</p>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{data?.public_url ? 'Replace the rulebook' : 'Upload a rulebook'}</h2>

            <label className={styles.dropzone}>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className={styles.fileInput}
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              <span className={styles.dropButton}>Choose PDF</span>
              <span className={styles.fileName}>
                {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB` : 'No file selected'}
              </span>
            </label>

            <p className={styles.hint}>PDF only · 20MB maximum.</p>

            <Button variant="primary" onClick={upload} disabled={!file || busy}>
              {busy ? 'Uploading…' : data?.public_url ? 'Replace published rulebook' : 'Publish rulebook'}
            </Button>
          </section>
        </div>
      )}

      <ConfirmModal
        open={confirmClear}
        title="Remove the rules PDF"
        message="The public Rules page will show an empty state and the file will be deleted from storage. You can upload a new one at any time."
        confirmLabel="Remove"
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
        busy={busy}
      />
    </div>
  )
}
