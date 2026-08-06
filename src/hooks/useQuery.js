import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal data-fetching hook: loading / error / data plus a refetch.
 *
 * `deps` controls when the fetch re-runs. The result of a stale request is
 * discarded so a slow response can't overwrite a newer one.
 */
export function useQuery(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const requestId = useRef(0)

  const run = useCallback(async () => {
    const id = ++requestId.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await fetcher()
      if (id === requestId.current) setState({ data, loading: false, error: null })
    } catch (error) {
      console.error('[KCSL] query failed:', error)
      if (id === requestId.current) setState({ data: null, loading: false, error })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { run() }, [run])

  return { ...state, refetch: run }
}

/** Several fetchers at once, resolved into a keyed object. */
export function useQueries(fetcherMap, deps = []) {
  const keys = Object.keys(fetcherMap)
  return useQuery(async () => {
    const values = await Promise.all(keys.map((k) => fetcherMap[k]()))
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
