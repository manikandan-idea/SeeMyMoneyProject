// One folder card: name, usage badge, recursive total, and a hide icon.

import { formatINR } from '../utils/format.js'
import { directTotalOf, directCountOf } from '../data/sampleData.js'

function usageBadge(folder) {
  if (folder.usage === 'daily') return '🔁 Daily'
  if (folder.usage === 'monthly') return '🗓 Monthly'
  if (folder.usage === 'yearly') return '📆 Yearly'
  if (folder.usage === 'occasional' && folder.frequency === 'once') return '⚡ One-time'
  if (folder.usage === 'occasional') return '🔁 Multi-use'
  return null
}

function FolderCard({ folder, onOpen, onHide }) {
  const count = directCountOf(folder)
  return (
    <div className="folder-card-wrap">
      <button type="button" className="folder-card" onClick={onOpen}>
        <span className="folder-card__name">📁 {folder.name}</span>
        {usageBadge(folder) && <span className="folder-card__badge">{usageBadge(folder)}</span>}
        <span
          className="folder-card__meta"
          title="Money directly in this folder — subfolders are counted on their own cards"
        >
          {count === 0
            ? '0 entries'
            : `${count} ${count === 1 ? 'entry' : 'entries'}`}
          {' · '}
          <strong className="folder-card__amount">{formatINR(directTotalOf(folder))}</strong>
        </span>
      </button>
      <button
        type="button"
        className="folder-card__hide"
        title="Hide this folder (find it under 🙈 Hidden)"
        onClick={onHide}
      >
        🙈
      </button>
    </div>
  )
}

export default FolderCard
