// Saving Area: every folder AND every period page has one. It lists the items
// deliberately added for the next settlement level. These are NOT money records:
// they never change Spend / Received / Savings totals.
//
// Props:
//   entries   SavingAreaEntry[] owned by this folder/page
//   choices   { checklists: [{ id, title }], folders: [{ id, name }] }   what can be added
//   onAdd({ sourceType: 'checklist' | 'folder', sourceId })             one new entry each time
//   onOpen()  tapping the card opens the Saving Area page

import { useEffect, useState } from 'react'
import { groupSavingAreaEntries } from '../domain/folderChecklist.js'
import { formatINR } from '../utils/format.js'
import './folders.css'

function SavingArea({ entries, choices, onAdd, onOpen, title = '🐖 Saving Area', hint = 'Tap this card to open the Saving Area.', hideAdd = false, expanded }) {
  const [open, setOpen] = useState(false)
  const groups = groupSavingAreaEntries(entries)
  const total = choices.checklists.length + choices.folders.length

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <section
      className={`saving-area${onOpen ? ' saving-area--link' : ''}`}
      aria-label="Saving Area"
      role={onOpen ? 'button' : undefined}
      aria-expanded={expanded}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } } : undefined}
    >
      <div className="checklist__head">
        <h3 className="checklist__title">{title}</h3>
        {!hideAdd && (
          <button type="button" className="btn btn--sm" onClick={(e) => { e.stopPropagation(); setOpen(true) }}>
            + Add Items
          </button>
        )}
      </div>
      {onOpen && <p className="modal__hint">{hint}</p>}
      {groups.length === 0 ? (
        <p className="other-panel__empty">Nothing in the Saving Area yet.{hideAdd ? '' : ' Use “+ Add Items”.'}</p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="saving-area__row">
            <span>{group.sourceType === 'folder' ? '📁' : '📋'} {group.titleSnapshot}{group.amount !== undefined ? ` · ${formatINR(group.amount)}` : ''}</span>
            <span className="saving-area__count">×{group.count}</span>
          </div>
        ))
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Add items to Saving Area"
            onClick={(e) => e.stopPropagation()}>
            <h3>Add to Saving Area</h3>
            <p className="modal__hint">Each tap adds one entry. The original checklist or folder stays where it is.</p>
            {total === 0 && <p className="other-panel__empty">Add a checklist or folder here first.</p>}
            {choices.checklists.map((c) => (
              <button key={c.id} type="button" className="btn btn--ghost saving-pick"
                onClick={() => onAdd({ sourceType: 'checklist', sourceId: c.id })}>
                📋 {c.title}
              </button>
            ))}
            {choices.folders.map((f) => (
              <button key={f.id} type="button" className="btn btn--ghost saving-pick"
                onClick={() => onAdd({ sourceType: 'folder', sourceId: f.id })}>
                📁 {f.name}
              </button>
            ))}
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default SavingArea
