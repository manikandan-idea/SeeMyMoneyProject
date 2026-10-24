// Hidden folders page: every 🙈-hidden folder across all three sections,
// with a Restore button that makes it active again.

import { formatINR } from '../utils/format.js'
import { collectHidden, directTotalOf } from '../data/sampleData.js'

const sections = [
  { id: 'income', title: 'Income', icon: '💰' },
  { id: 'expense', title: 'Expense', icon: '💸' },
  { id: 'saving', title: 'Saving', icon: '🐖' },
]

function HiddenView({ data, onBack, onRestore }) {
  const entries = []
  for (const section of sections) {
    for (const found of collectHidden(data[section.id])) {
      entries.push({ ...found, section })
    }
  }

  return (
    <main className="section">
      <div className="section__toolbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Dashboard
        </button>
        <h2 className="section__title">🙈 Hidden folders</h2>
      </div>

      {entries.length === 0 ? (
        <div className="items-panel">
          <div className="empty">No hidden folders. Hide one with the 🙈 icon on its card.</div>
        </div>
      ) : (
        <div className="items-panel">
          {entries.map(({ folder, names, section }) => (
            <div key={folder.id} className="hidden-row">
              <div className="item-row__main">
                <div className="item-row__desc">📁 {folder.name}</div>
                <div className="item-row__date">
                  {section.icon} {section.title} › {names.join(' › ')}
                  {' · '}
                  {folder.usage === 'daily'
                    ? 'Daily'
                    : folder.usage === 'monthly'
                      ? 'Monthly'
                      : folder.usage === 'yearly'
                        ? 'Yearly'
                        : folder.frequency === 'once'
                          ? 'One-time'
                          : 'Multi-use'}
                  {' · '}
                  {formatINR(directTotalOf(folder))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onRestore(folder.id)}
              >
                👁 Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default HiddenView
