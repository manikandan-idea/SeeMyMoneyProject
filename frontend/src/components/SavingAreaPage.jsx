// Saving Area page — opens when the Saving Area card of a folder or period page is tapped.
// Same look and rules as the Folder View master context:
//   * top box with heading, three cards (Spend / Received / Savings)
//   * Checklist card: name · [N records · ₹total] (only if N > 1) · ₹amount ✎ · 🗑
//   * Folders card: name · "N checklists · N folders" · [N records] · 🗑 · three chips
//   * no Add buttons here (use "+ Add Items" on the Saving Area card)
//   * 🗑 removes ONE entry; the card disappears only when its last entry is gone
//
// These are Saving Area ENTRIES, not money records. The three cards add up the
// current default amounts of the checklist entries (display only) and are never
// part of the real Spend / Received / Savings totals.
//
// Props: state, ownerId, title, onBack(),
//        onRemoveEntry(entryId)                  removes exactly that one entry
//        onUpdateDefault(checklistId, amount)    pencil: reusable default (future records only)

import { useState } from 'react'
import { formatINR } from '../utils/format.js'
import { groupSavingAreaEntries } from '../domain/folderChecklist.js'
import { calculateFolderTotals } from '../domain/analytics.js'
import './savingAreaPage.css'

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
const FOLDER = 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
const PENCIL = 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
const BACK = 'M15 18l-6-6 6-6'
const TRASH = 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6'

function SavingAreaPage({ state, ownerId, title, onBack, onRemoveEntry, onUpdateDefault }) {
  const [editingKey, setEditingKey] = useState(null)
  const [draft, setDraft] = useState('')

  const groups = groupSavingAreaEntries(state.savingAreaEntries.filter((e) => e.ownerFolderId === ownerId))
  const checklistGroups = groups
    .filter((g) => g.sourceType === 'checklist')
    .map((g) => ({ ...g, template: state.checklists.find((c) => c.id === g.sourceId) ?? null }))
  const folderGroups = groups
    .filter((g) => g.sourceType === 'folder')
    .map((g) => ({ ...g, folder: state.folders.find((f) => f.id === g.sourceId) ?? null }))

  const totals = { expense: 0, income: 0, saving: 0 }
  for (const g of checklistGroups) {
    if (g.template) totals[g.template.transactionType] += g.template.defaultAmount * g.count
  }

  const removeOne = (group) => onRemoveEntry(group.entries[group.entries.length - 1].id)

  function startEdit(g) { setEditingKey(g.key); setDraft(String(g.template.defaultAmount)) }
  function save(g) {
    const value = Number(draft)
    if (Number.isFinite(value) && value > 0 && value !== g.template.defaultAmount) {
      onUpdateDefault(g.template.id, value)
    }
    setEditingKey(null)
  }

  return (
    <main className="sa-page">
      <section className="sa-top" aria-label={`Saving Area of ${title}`}>
        <div className="sa-head">
          <button type="button" className="sa-icon-btn" aria-label="Back" onClick={onBack}>
            <Icon d={BACK} size={22} />
          </button>
          <span className="sa-badge" aria-hidden="true">🐷</span>
          <h1>Saving Area · {title}</h1>
        </div>

        <div className="sa-totals">
          <div className="sa-total spend"><span>Spend</span><strong>{formatINR(totals.expense)}</strong></div>
          <div className="sa-total received"><span>Received</span><strong>{formatINR(totals.income)}</strong></div>
          <div className="sa-total savings"><span>Savings</span><strong>{formatINR(totals.saving)}</strong></div>
        </div>
        <p className="sa-note">Added up from the items below. This is not recorded money.</p>

        <div className="sa-card">
          <h2>Checklist</h2>
          {checklistGroups.length === 0 ? (
            <p className="sa-empty">No checklists in this Saving Area.</p>
          ) : (
            <ul className="sa-rows">
              {checklistGroups.map((g) => (
                <li key={g.key} className="sa-item">
                  <div className="sa-row">
                    <span className="sa-name">{g.titleSnapshot}</span>
                    {g.count > 1 && g.template && editingKey !== g.key && (
                      <span className="sa-records">
                        <span>{g.count} records</span><span>·</span>
                        <strong>{formatINR(g.template.defaultAmount * g.count)}</strong>
                      </span>
                    )}
                    {g.count > 1 && !g.template && <span className="sa-records">{g.count} records</span>}
                    {g.template && (editingKey === g.key ? (
                      <span className="sa-edit">
                        <span>₹</span>
                        <input type="number" inputMode="decimal" min="1" autoFocus value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') save(g)
                            if (e.key === 'Escape') setEditingKey(null)
                          }} />
                        <button type="button" className="sa-ok" aria-label="Save amount" onClick={() => save(g)}>✓</button>
                        <button type="button" className="sa-cancel" aria-label="Cancel" onClick={() => setEditingKey(null)}>✕</button>
                      </span>
                    ) : (
                      <span className="sa-amount">
                        {formatINR(g.template.defaultAmount)}
                        <button type="button" className="sa-icon-btn small" aria-label={`Edit ${g.titleSnapshot} amount`}
                          onClick={() => startEdit(g)}>
                          <Icon d={PENCIL} size={11} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className="sa-delete" aria-label={`Remove one ${g.titleSnapshot} from Saving Area`}
                      onClick={() => removeOne(g)}>
                      <Icon d={TRASH} size={17} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sa-card">
          <h2>📁 Folders</h2>
          {folderGroups.length === 0 ? (
            <p className="sa-empty">No folders in this Saving Area.</p>
          ) : (
            <ul className="sa-rows">
              {folderGroups.map((g) => {
                const lists = g.folder ? state.checklists.filter((c) => c.folderId === g.folder.id).length : 0
                const kids = g.folder ? state.folders.filter((f) => f.parentFolderId === g.folder.id).length : 0
                const t = g.folder ? calculateFolderTotals(state, g.folder.id) : null
                return (
                  <li key={g.key} className="sa-item">
                    <div className="sa-row">
                      <span className="sa-badge sm" aria-hidden="true"><Icon d={FOLDER} size={16} /></span>
                      <div className="sa-info">
                        <strong className="sa-name">{g.titleSnapshot}</strong>
                        {g.folder && <small>{lists} checklists · {kids} {kids === 1 ? 'folder' : 'folders'}</small>}
                      </div>
                      {g.count > 1 && <span className="sa-records">{g.count} records</span>}
                      <button type="button" className="sa-delete" aria-label={`Remove one ${g.titleSnapshot} from Saving Area`}
                        onClick={() => removeOne(g)}>
                        <Icon d={TRASH} size={17} />
                      </button>
                    </div>
                    {t && (
                      <div className="sa-chips">
                        <span className="sa-chip spend">Spend <b>{formatINR(t.expense)}</b></span>
                        <span className="sa-chip received">Received <b>{formatINR(t.income)}</b></span>
                        <span className="sa-chip savings">Savings <b>{formatINR(t.saving)}</b></span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  )
}

export default SavingAreaPage
