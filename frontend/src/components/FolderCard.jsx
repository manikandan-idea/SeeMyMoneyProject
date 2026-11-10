// One folder card: name, usage badge, small summary, hide icon and (when the
// current folder has a Saving Area) a "+ Add Items" button that adds this whole
// folder to that Saving Area as ONE entry.
//
// Props:
//   folder      folder node from selectFolderTree (has .folders and .checklists)
//   summary     optional { count, total } supplied by the integrator (analytics)
//   canAddToSavingArea  false at the section root (no folder owns a Saving Area there)
//   onOpen() / onHide() / onAddToSavingArea()

import { formatINR } from '../utils/format.js'
import './folders.css'

function usageBadge(folder) {
  if (folder.usage === 'daily') return '🔁 Daily'
  if (folder.usage === 'monthly') return '🗓 Monthly'
  if (folder.usage === 'yearly') return '📆 Yearly'
  if (folder.usage === 'occasional' && folder.frequency === 'once') return '⚡ One-time'
  if (folder.usage === 'occasional') return '🔁 Multi-use'
  return null
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function FolderCard({ folder, summary, canAddToSavingArea = false, onOpen, onHide, onAddToSavingArea }) {
  const structure = `${plural(folder.checklists.length, 'checklist')} · ${plural(folder.folders.length, 'folder')}`
  return (
    <div className="folder-card-wrap">
      <button type="button" className="folder-card" onClick={onOpen}>
        <span className="folder-card__name">📁 {folder.name}</span>
        {usageBadge(folder) && <span className="folder-card__badge">{usageBadge(folder)}</span>}
        <span className="folder-card__meta">
          {structure}
          {summary && (
            <>
              {' · '}
              {summary.count} {summary.count === 1 ? 'entry' : 'entries'}
              {' · '}
              <strong className="folder-card__amount">{formatINR(summary.total)}</strong>
            </>
          )}
        </span>
      </button>
      <button
        type="button"
        className="folder-card__hide"
        title="Hide this folder (find it under 🙈 Hidden)"
        aria-label={`Hide folder ${folder.name}`}
        onClick={onHide}
      >
        🙈
      </button>
      {canAddToSavingArea && (
        <button
          type="button"
          className="folder-card__saving"
          title="Add this whole folder to the Saving Area"
          aria-label={`Add folder ${folder.name} to Saving Area`}
          onClick={onAddToSavingArea}
        >
          + Add Items
        </button>
      )}
    </div>
  )
}

export default FolderCard
