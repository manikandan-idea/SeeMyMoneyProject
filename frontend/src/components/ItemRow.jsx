// One money record (Transaction): description + date&time, amount on the right.
// Display only — deleting/editing a record belongs to Record History.

import { formatINR, formatDateTime } from '../utils/format.js'

function ItemRow({ item }) {
  return (
    <div className="item-row">
      <div className="item-row__main">
        <div className="item-row__desc">{item.description}</div>
        {item.details && item.details !== item.description && (
          <div className="item-row__note">{item.details}</div>
        )}
        <div className="item-row__date">
          {formatDateTime(item.recordedAt)}
          {item.source === 'checklist-other' ? ' · one-time amount' : ''}
          {item.source === 'folder-one-time' ? ' · one-time folder amount' : ''}
          {item.from ? ` · from “${item.from}”` : ''}
        </div>
      </div>
      <div className="item-row__amount">{formatINR(item.amount)}</div>
    </div>
  )
}

export default ItemRow
