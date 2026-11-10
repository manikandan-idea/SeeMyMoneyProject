// One section tile (Income / Expense / Saving) on the dashboard.
// Clicking it opens that section's folder view.
// `count` is the number of individual transactions (never templates or Saving Area entries).

import { formatINR } from '../utils/format.js'

function SectionTile({ id, title, icon, total, count, onOpen }) {
  return (
    <button type="button" className={`tile tile--${id}`} onClick={onOpen}>
      <span className="tile__icon">{icon}</span>
      <h2 className="tile__title">{title}</h2>
      <p className="tile__total">{formatINR(total)}</p>
      <p className="tile__count">
        {count === 0 ? 'No transactions yet' : `${count} ${count === 1 ? 'transaction' : 'transactions'}`}
      </p>
      <span className="tile__open">Open →</span>
    </button>
  )
}

export default SectionTile
