// Compact list of the most recent individual transactions (shared by Dashboard and Summary).

import { formatINR, formatDateTime } from '../../utils/format.js'

const TYPE_LABEL = { income: 'Received', expense: 'Spend', saving: 'Savings' }

function RecentList({ transactions }) {
  if (transactions.length === 0) {
    return <p className="sum-empty">No transactions recorded yet.</p>
  }
  return (
    <ul className="sum-recent">
      {transactions.map((tx) => {
        const type = tx.transactionType || tx.sectionId
        return (
          <li key={tx.id} className="sum-recent__row">
            <span className={`sum-dot sum-dot--${type}`} aria-hidden="true" />
            <span className="sum-recent__main">
              <span className="sum-recent__title">
                {tx.checklistTitleSnapshot || tx.description || 'Transaction'}
              </span>
              <span className="sum-recent__meta">
                {TYPE_LABEL[type] || type}
                {tx.folderNameSnapshot ? ` · ${tx.folderNameSnapshot}` : ''}
                {tx.recordedAt ? ` · ${formatDateTime(tx.recordedAt)}` : ''}
              </span>
            </span>
            <span className={`sum-recent__amount sum-text--${type}`}>{formatINR(tx.amount)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default RecentList
