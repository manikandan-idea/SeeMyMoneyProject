// One individual transaction. Delete/Edit act on exactly this record id.

import { formatINR, formatDateTime } from '../../utils/format.js'

const TYPE_LABEL = { income: 'Income', expense: 'Expense', saving: 'Saving' }

function RecordRow({ record, showTitle = true, onEdit, onDelete }) {
  const place = [record.folderNameSnapshot, record.checklistTitleSnapshot && record.checklistTitleSnapshot !== record.description ? record.checklistTitleSnapshot : null]
    .filter(Boolean)
    .join(' › ')
  return (
    <li className="rec-row">
      <div className="rec-row__main">
        {showTitle && <div className="rec-row__title">{record.description}</div>}
        <div className="rec-row__meta">
          <span className={`rec-badge rec-badge--${record.transactionType}`}>{TYPE_LABEL[record.transactionType] || record.transactionType}</span>
          <span>{formatDateTime(record.recordedAt)}</span>
          {place && <span>· {place}</span>}
        </div>
      </div>
      <div className="rec-row__amount">{formatINR(record.amount)}</div>
      <div className="rec-row__actions">
        {onEdit && (
          <button type="button" className="rec-btn" onClick={() => onEdit(record)} aria-label={`Edit amount of ${record.description}, ${formatINR(record.amount)}`}>Edit</button>
        )}
        <button type="button" className="rec-btn rec-btn--danger" onClick={() => onDelete(record)} aria-label={`Delete record ${record.description}, ${formatINR(record.amount)}, ${formatDateTime(record.recordedAt)}`}>Delete</button>
      </div>
    </li>
  )
}

export default RecordRow
