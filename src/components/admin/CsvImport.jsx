import { useRef, useState } from 'react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { downloadTemplate } from '../../lib/adminApi.js'
import { readCsvText } from '../../lib/csv.js'
import styles from './CsvImport.module.css'

/**
 * CSV import dialog. Docs Section 5: validate every row first, write nothing
 * until all of them pass, and report failures by row number.
 *
 * The actual validation lives in lib/csv.js; this component only drives it and
 * renders the error table.
 *
 * @param {Function} onImport  (file) => Promise<{ok, errors, inserted}>
 */
export default function CsvImport({
  open, title, template, sample, templateFilename, onImport, onClose, onSuccess,
}) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  // The file's CONTENTS, read the instant it is chosen. See readCsvText() —
  // holding a File reference until the user clicks import races against Excel
  // and iCloud replacing the file on disk.
  const [fileText, setFileText] = useState(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState(null)
  const [result, setResult] = useState(null)

  const reset = () => {
    setFile(null)
    setFileText(null)
    setReading(false)
    setErrors(null)
    setResult(null)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  /** Read immediately, so an unreadable file is reported now, not later. */
  const pickFile = async (selected) => {
    setErrors(null)
    setFileText(null)
    setFile(selected ?? null)
    if (!selected) return

    setReading(true)
    try {
      const text = await readCsvText(selected)
      if (!text.trim()) {
        setErrors([{ row: 0, message: `"${selected.name}" is empty. Fill in at least one row below the header and save it again.` }])
        setFile(null)
      } else {
        setFileText(text)
      }
    } catch (err) {
      setErrors([{ row: 0, message: err.message }])
      setFile(null)
    } finally {
      setReading(false)
    }
  }

  const close = () => { reset(); onClose?.() }

  const run = async () => {
    if (!fileText) return
    setBusy(true)
    setErrors(null)
    setResult(null)
    try {
      const outcome = await onImport(fileText)
      if (outcome.ok) {
        setResult(outcome)
        onSuccess?.(outcome)
      } else {
        setErrors(outcome.errors)
      }
    } catch (err) {
      setErrors([{ row: 0, message: err.message || String(err) }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      width={720}
      footer={
        <>
          <Button onClick={close} disabled={busy}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && (
            <Button variant="primary" onClick={run} disabled={!fileText || busy || reading}>
              {busy ? 'Validating…' : reading ? 'Reading file…' : 'Validate & import'}
            </Button>
          )}
        </>
      }
    >
      {!result && (
        <>
          <p className={styles.intro}>
            Every row is checked before anything is written. If a single row fails,
            <strong> nothing is imported</strong> — fix the file and try again.
          </p>

          {/* Blank template first — it's the path of least resistance, and it
              guarantees the header row is exactly right. The worked example
              below is for reading; it is deliberately NOT in the downloaded
              file, so nobody imports the sample rows by accident. */}
          {templateFilename && (
            <div className={styles.templateCta}>
              <div>
                <strong>Start from the blank template</strong>
                <span className={styles.hint}>
                  A CSV with the correct headers and no rows. Open it in Excel or
                  Google Sheets, fill it in, and upload it below.
                </span>
              </div>
              <Button
                variant="primary"
                onClick={() => downloadTemplate(template.split(','), templateFilename)}
              >
                Download template
              </Button>
            </div>
          )}

          <div className={styles.templateBox}>
            <div className={styles.templateHead}>
              <span>Example — what a filled-in file looks like</span>
              <button
                type="button"
                className={styles.copy}
                onClick={() => navigator.clipboard?.writeText(`${template}\n${sample}`)}
              >
                Copy
              </button>
            </div>
            <pre className={styles.template}>{template}{'\n'}{sample}</pre>
            <p className={styles.hint}>
              Team, division, and field names must match existing records <strong>exactly</strong>,
              including capitalization and spacing.
            </p>
          </div>

          <label className={styles.fileLabel}>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.fileInput}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <span className={styles.fileButton}>Choose CSV file</span>
            <span className={styles.fileName}>
              {reading ? 'Reading…' : file ? `${file.name} — ready` : 'No file selected'}
            </span>
          </label>

          {errors && errors.length > 0 && (
            <div className={styles.errorBox}>
              <h3 className={styles.errorTitle}>
                Import rejected — {errors.length} problem{errors.length === 1 ? '' : 's'} found.
                Nothing was written.
              </h3>
              <div className={styles.errorScroll}>
                <table className={styles.errorTable}>
                  <thead>
                    <tr><th>Row</th><th>Problem</th></tr>
                  </thead>
                  <tbody>
                    {errors.map((err, i) => (
                      <tr key={i}>
                        <td className={styles.rowNum}>{err.row > 0 ? err.row : '—'}</td>
                        <td>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {result && (
        <div className={styles.successBox}>
          {result.unchanged ? (
            <strong>Nothing to change — every row already matches what's on the schedule.</strong>
          ) : (
            <strong>
              {result.verb ?? 'Imported'} {result.inserted} row{result.inserted === 1 ? '' : 's'}.
            </strong>
          )}
          {result.autoFinalized > 0 && (
            <p className={styles.hint}>
              {result.autoFinalized === 1
                ? '1 game had a score but wasn’t marked final — it has been set to '
                : `${result.autoFinalized} games had a score but weren’t marked final — they have been set to `}
              <strong>Final</strong>
              {result.autoFinalized === 1
                ? ', so it now counts toward the standings.'
                : ', so they now count toward the standings.'}
            </p>
          )}
          <p className={styles.hint}>The list behind this dialog has been refreshed.</p>
        </div>
      )}
    </Modal>
  )
}
