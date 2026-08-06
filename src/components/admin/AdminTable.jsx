import { useEffect, useState } from 'react'
import styles from './AdminTable.module.css'

/**
 * Admin data table with optional drag-and-drop row reordering.
 *
 * Reordering is also operable from the keyboard (focus the handle, then
 * Arrow Up / Arrow Down) — drag-and-drop alone would make the Divisions and
 * Fields pages unusable without a mouse.
 *
 * @param {{key:string,label:string,render?:Function,align?:'left'|'right'|'center',width?:string}[]} columns
 * @param {Function} onReorder  (orderedIds) => void — omit to disable dragging
 */
export default function AdminTable({
  columns,
  rows,
  getRowId = (row) => row.id,
  onReorder,
  renderActions,
  rowClassName,
  empty = 'Nothing here yet.',
}) {
  const [order, setOrder] = useState(rows)
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)

  // Keep local order in sync when the parent refetches.
  useEffect(() => { setOrder(rows) }, [rows])

  const commit = (next) => {
    setOrder(next)
    onReorder?.(next.map(getRowId))
  }

  const move = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= order.length || fromIndex === toIndex) return
    const next = [...order]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    commit(next)
  }

  const handleDrop = (targetId) => {
    if (!draggingId || draggingId === targetId) return
    const from = order.findIndex((r) => getRowId(r) === draggingId)
    const to = order.findIndex((r) => getRowId(r) === targetId)
    move(from, to)
  }

  if (!rows.length) {
    return <div className={styles.empty}>{empty}</div>
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {onReorder && <th className={styles.handleCol}><span className="visually-hidden">Reorder</span></th>}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, textAlign: col.align ?? 'left' }}
              >
                {col.label}
              </th>
            ))}
            {renderActions && <th className={styles.actionsCol}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {order.map((row, index) => {
            const id = getRowId(row)
            return (
              <tr
                key={id}
                className={[
                  rowClassName?.(row) ?? '',
                  draggingId === id ? styles.dragging : '',
                  overId === id ? styles.dragOver : '',
                ].filter(Boolean).join(' ')}
                draggable={Boolean(onReorder)}
                onDragStart={() => setDraggingId(id)}
                onDragEnd={() => { setDraggingId(null); setOverId(null) }}
                onDragOver={(e) => { if (onReorder) { e.preventDefault(); setOverId(id) } }}
                onDragLeave={() => setOverId((v) => (v === id ? null : v))}
                onDrop={(e) => { e.preventDefault(); handleDrop(id); setOverId(null) }}
              >
                {onReorder && (
                  <td className={styles.handleCol}>
                    <button
                      type="button"
                      className={styles.handle}
                      aria-label={`Reorder row ${index + 1}. Use arrow up and arrow down to move.`}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp')   { e.preventDefault(); move(index, index - 1) }
                        if (e.key === 'ArrowDown') { e.preventDefault(); move(index, index + 1) }
                      }}
                    >
                      ⠿
                    </button>
                  </td>
                )}

                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render ? col.render(row, index) : row[col.key]}
                  </td>
                ))}

                {renderActions && (
                  <td className={styles.actionsCol}>
                    <div className={styles.actions}>{renderActions(row)}</div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
