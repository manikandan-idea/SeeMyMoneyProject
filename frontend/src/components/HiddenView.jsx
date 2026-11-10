// Hidden folders page: every hidden folder across all three sections, with a
// Restore button. Hiding never deletes anything; restoring just un-hides.
//
// Props: state (AppState), onBack(), onRestore(folderId),
//        getFolderTotals(folderId) -> { total, count }   (optional)

import { formatINR } from '../utils/format.js'
import { selectHiddenFolders } from '../domain/folderChecklist.js'
import './folders.css'

const SECTION_ICONS = { income: '💰', expense: '💸', saving: '🐖' }

function usageLabel(folder) {
  if (folder.usage === 'daily') return 'Daily'
  if (folder.usage === 'monthly') return 'Monthly'
  if (folder.usage === 'yearly') return 'Yearly'
  if (folder.usage === 'occasional') return folder.frequency === 'once' ? 'One-time' : 'Multi-use'
  return null
}

function HiddenView({ state, onBack, onRestore, getFolderTotals }) {
  const titleOf = (id) => ({ income: 'Received', expense: 'Spend', saving: 'Savings' })[id] ?? id
  const entries = selectHiddenFolders(state)

  return (
    <main className="section">
      <div className="section__toolbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <h2 className="section__title">🙈 Hidden folders</h2>
      </div>

      {entries.length === 0 ? (
        <div className="items-panel">
          <div className="empty">No hidden folders. Hide one with the 🙈 icon on its card.</div>
        </div>
      ) : (
        <div className="items-panel">
          {entries.map(({ folder, names, sectionId }) => {
            const totals = getFolderTotals ? getFolderTotals(folder.id) : null
            return (
              <div key={folder.id} className="hidden-row">
                <div className="item-row__main">
                  <div className="item-row__desc">📁 {folder.name}</div>
                  <div className="item-row__date">
                    {SECTION_ICONS[sectionId]} {titleOf(sectionId)} › {names.join(' › ')}
                    {usageLabel(folder) ? ` · ${usageLabel(folder)}` : ''}
                    {totals ? ` · ${formatINR(totals.total)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label={`Restore folder ${folder.name}`}
                  onClick={() => onRestore(folder.id)}
                >
                  👁 Restore
                </button>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

export default HiddenView
