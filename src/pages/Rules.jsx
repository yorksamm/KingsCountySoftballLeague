import { getRulesDocument } from '../lib/api.js'
import { useQuery } from '../hooks/useQuery.js'
import Spinner, { ErrorState, EmptyState } from '../components/ui/Spinner.jsx'
import { LEAGUE } from '../lib/constants.js'
import styles from '../styles/page.module.css'
import rulesStyles from './Rules.module.css'

export default function Rules() {
  const { data, loading, error, refetch } = useQuery(getRulesDocument, [])

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>League Rules</h1>
          <p className={styles.subtitle}>
            The official {LEAGUE.short} rulebook. Opens as a PDF in a new tab.
          </p>
        </div>
      </header>

      {loading && <Spinner label="Loading rules…" />}
      {error && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && !data?.public_url && (
        <EmptyState title="No rulebook posted yet">
          League management uploads the rules PDF from the admin panel.
        </EmptyState>
      )}

      {!loading && !error && data?.public_url && (
        <div className={rulesStyles.card}>
          <div className={rulesStyles.icon} aria-hidden="true">PDF</div>
          <div className={rulesStyles.detail}>
            <h2 className={rulesStyles.fileName}>{data.file_name || 'League Rules'}</h2>
            {data.updated_at && (
              <p className={rulesStyles.updated}>
                Last updated {new Date(data.updated_at).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </p>
            )}
          </div>
          <a
            className={rulesStyles.open}
            href={data.public_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open rulebook ↗
          </a>
        </div>
      )}
    </div>
  )
}
