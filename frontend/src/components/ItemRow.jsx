// One money entry: description + details + date&time, amount on the right.

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
          {item.from ? ` · from “${item.from}”` : ''}
        </div>
      </div>
      <div className="item-row__amount">{formatINR(item.amount)}</div>
    </div>
  )
}

export default ItemRow
