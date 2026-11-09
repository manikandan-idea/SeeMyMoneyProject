// Display-only group (e.g. Tea ₹15 — 5 records). Expands to the individual
// rows; there is intentionally NO group-level delete.

import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import RecordRow from './RecordRow.jsx'

function RecordGroup({ group, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rec-group">
      <button type="button" className="rec-group__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="rec-group__title">{group.title} {formatINR(group.amount)}</span>
        <span className="rec-group__count">{group.count} {group.count === 1 ? 'record' : 'records'}</span>
        <span className="rec-group__total">{formatINR(group.total)}</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="rec-list rec-list--nested">
          {group.records.map((r) => (
            <RecordRow key={r.id} record={r} showTitle={false} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default RecordGroup
