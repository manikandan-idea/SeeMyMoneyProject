// The page's Saving Area card, opened IN PLACE in the folder-view look (same card, same
// sections as an opened folder): header with ✓ Done, a Checklists section and a Folders
// section, stats at the bottom. Nothing opens below or on another page.
//
// Rows are Saving Area ENTRIES (grouped), never money records:
//   checklist row  Records(N) · name · ₹amount ✎ · Other · + · 🗑
//   folder row     Records(N) · name · counts · Add item · 🗑 · Spend/Received/Savings
// Props: state, ownerId, title, onClose(), onAdd({ sourceType, sourceId, amount?, id? }),
//        onRemove(entryId), onRestore(entry), onUpdateDefault(checklistId, amount),
//        onUpdateEntries(entryIds, amount)
// ← → at the bottom undo / redo adding and removing entries made in this view.
import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import { groupSavingAreaEntries, makeId } from '../../domain/folderChecklist.js'
import { calculateFolderTotals } from '../../domain/analytics.js'
import Svg from './Svg.jsx'
import './cards.css'

const FOLDER_SVG = 'M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
const TRASH_SVG = 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3'
const PENCIL_SVG = 'M4 20h4L18.5 9.5a2.8 2.8 0 1 0-4-4L4 16v4M13.5 6.5l4 4'

function ChecklistEntryRow({ g, template, onAdd, onRemoveOne, onUpdateDefault, onUpdateEntries }) {
  const [mode, setMode] = useState(null) // null | 'default' | 'other'
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const amount = g.amount ?? template?.defaultAmount ?? 0
  const open = (m) => { setMode(m); setValue(m === 'other' ? '' : String(amount)); setBad(false) }
  function done() {
    const n = Number(value)
    if (!(n > 0)) { setBad(true); return }
    if (mode === 'default') { if (n !== template.defaultAmount) onUpdateDefault(template.id, n) }
    else if (mode === 'entry') { if (n !== g.amount) onUpdateEntries(g.entries.map((e) => e.id), n) }
    else onAdd(n)
    setMode(null)
  }
  if (mode) {
    return (
      <div className="cr">
        <span className="cr__etitle">{mode === 'other' ? 'Amount ₹' : mode === 'default' ? 'Default ₹' : 'Amount ₹'}</span>
        <input className="cr__input" type="number" min="1" inputMode="decimal" autoFocus value={value}
          aria-label="Amount in rupees" style={bad ? { borderColor: '#c0262d' } : undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setMode(null) }} />
        <button type="button" className="cr__cancel" aria-label="Cancel" onClick={() => setMode(null)}>
          <Svg d="M18 6L6 18M6 6l12 12" />
        </button>
        <button type="button" className="cr__ok" onClick={done}>{mode === 'other' ? 'Add' : 'Save'}</button>
      </div>
    )
  }
  return (
    <div className="cr">
      <div className="cr__count" role="status" aria-label={`Records: ${g.count}`}><b>{g.count}</b><span>Records</span></div>
      <span className="cr__name" title={g.titleSnapshot}>{g.titleSnapshot}</span>
      {!template ? (
        <span className="cr__def" style={{ cursor: 'default' }}>{formatINR(amount)}</span>
      ) : (
        <button type="button" className="cr__def" aria-label="Edit amount" onClick={() => open(g.amount !== undefined ? 'entry' : 'default')}>
          {formatINR(amount)}<span className="cr__pencil"><Svg d={PENCIL_SVG} size={14} /></span>
        </button>
      )}
      {template && (
        <>
          <button type="button" className="cr__other" aria-label="Add with a different amount" onClick={() => open('other')}>Other</button>
          <button type="button" className="cr__rec" aria-label={`Add one more ${g.titleSnapshot}`}
            onClick={() => onAdd(g.amount)}>+</button>
        </>
      )}
      <button type="button" className="cr__del" aria-label="Remove one" title="Remove one" onClick={onRemoveOne}>
        <Svg d={TRASH_SVG} />
      </button>
    </div>
  )
}

function SavingFolderView({ state, ownerId, title, onClose, onAdd: add, onRemove: remove, onRestore, onUpdateDefault, onUpdateEntries }) {
  const [undo, setUndo] = useState([]) // { t:'add', id, input } | { t:'rem', entry }
  const [redo, setRedo] = useState([])
  const onAdd = (input) => {
    const id = makeId()
    add({ ...input, id })
    setUndo((u) => [...u, { t: 'add', id, input }]); setRedo([])
  }
  const groups = groupSavingAreaEntries(state.savingAreaEntries.filter((e) => e.ownerFolderId === ownerId))
  const lists = groups.filter((g) => g.sourceType === 'checklist')
  const folders = groups.filter((g) => g.sourceType === 'folder')
  const removeOne = (g) => {
    const entry = g.entries[g.entries.length - 1]
    remove(entry.id)
    setUndo((u) => [...u, { t: 'rem', entry }]); setRedo([])
  }
  function doUndo() {
    const a = undo[undo.length - 1]; if (!a) return
    if (a.t === 'add') remove(a.id); else onRestore(a.entry)
    setUndo(undo.slice(0, -1)); setRedo([...redo, a])
  }
  function doRedo() {
    const a = redo[redo.length - 1]; if (!a) return
    if (a.t === 'add') add({ ...a.input, id: a.id }); else remove(a.entry.id)
    setRedo(redo.slice(0, -1)); setUndo([...undo, a])
  }

  const totals = { expense: 0, income: 0, saving: 0 }
  for (const g of lists) {
    const t = state.checklists.find((c) => c.id === g.sourceId)
    if (t) totals[t.transactionType] += (g.amount ?? t.defaultAmount) * g.count
  }

  return (
    <div className="fc fc--d0 fc--copy" aria-label={`Saving Area ${title}`}>
      <div className="fc__row">
        <span className="fc__tile"><Svg d={FOLDER_SVG} size={20} /></span>
        <span className="fc__who">
          <div className="fc__name">{title}</div>
          <div className="fc__sub">
            <span><i className="fc__dot" />{lists.length} {lists.length === 1 ? 'checklist' : 'checklists'}</span>
            <span><i className="fc__dot" />{folders.length} {folders.length === 1 ? 'folder' : 'folders'}</span>
          </div>
        </span>
        <button type="button" className="fc__edit fc__edit--on" onClick={onClose}>✓ Done</button>
      </div>

      <div className="fc__inside">
        <div className="fc__sec">
          <div className="fc__sechead"><span className="fc__sectitle">Checklists</span></div>
          <div className="sv__list">
            {lists.length === 0 && <div className="sv__empty">No checklists yet</div>}
            {lists.map((g) => (
              <ChecklistEntryRow key={g.key} g={g} template={state.checklists.find((c) => c.id === g.sourceId) ?? null}
                onAdd={(amount) => onAdd({ sourceType: 'checklist', sourceId: g.sourceId, ...(amount ? { amount } : {}) })}
                onRemoveOne={() => removeOne(g)} onUpdateDefault={onUpdateDefault} onUpdateEntries={onUpdateEntries} />
            ))}
          </div>
        </div>

        <div className="fc__sec">
          <div className="fc__sechead"><span className="fc__sectitle">Folders</span></div>
          <div className="sv__list">
            {folders.length === 0 && <div className="sv__empty">No folders yet</div>}
            {folders.map((g) => {
              const f = state.folders.find((x) => x.id === g.sourceId)
              const t = f ? calculateFolderTotals(state, f.id) : { expense: 0, income: 0, saving: 0 }
              const nL = f ? state.checklists.filter((c) => c.folderId === f.id).length : 0
              const nF = f ? state.folders.filter((x) => x.parentFolderId === f.id && !x.hidden).length : 0
              return (
                <div key={g.key} className="fc fc--d1 fc--inner">
                  <div className="fc__row">
                    <div className="fc__count" role="status" aria-label={`Records: ${g.count}`}><b>{g.count}</b><span>Records</span></div>
                    <span className="fc__tile"><Svg d={FOLDER_SVG} size={20} /></span>
                    <span className="fc__who">
                      <div className="fc__name">{g.titleSnapshot}</div>
                      <div className="fc__sub">
                        <span><i className="fc__dot" />{nL} {nL === 1 ? 'checklist' : 'checklists'}</span>
                        <span><i className="fc__dot" />{nF} {nF === 1 ? 'folder' : 'folders'}</span>
                      </div>
                    </span>
                    <button type="button" className="fc__add" onClick={() => onAdd({ sourceType: 'folder', sourceId: g.sourceId })}>+ Add item</button>
                    <button type="button" className="fc__del" aria-label="Remove one" title="Remove one" onClick={() => removeOne(g)}>
                      <Svg d={TRASH_SVG} />
                    </button>
                  </div>
                  <div className="fc__stats">
                    <div className="fc__stat fc__stat--s"><span>Spend</span><b>{formatINR(t.expense)}</b></div>
                    <div className="fc__stat fc__stat--r"><span>Received</span><b>{formatINR(t.income)}</b></div>
                    <div className="fc__stat fc__stat--v"><span>Savings</span><b>{formatINR(t.saving)}</b></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="fc__statrow">
        <div className="fc__stats">
          <div className="fc__stat fc__stat--s"><span>Spend</span><b>{formatINR(totals.expense)}</b></div>
          <div className="fc__stat fc__stat--r"><span>Received</span><b>{formatINR(totals.income)}</b></div>
          <div className="fc__stat fc__stat--v"><span>Savings</span><b>{formatINR(totals.saving)}</b></div>
        </div>
        <button type="button" className="fc__arrow" aria-label="Undo" disabled={!undo.length} onClick={doUndo} title="Undo">
          <Svg d="M5 12h14M5 12l6 6M5 12l6-6" size={15} />
        </button>
        <button type="button" className="fc__arrow" aria-label="Redo" disabled={!redo.length} onClick={doRedo} title="Redo">
          <Svg d="M5 12h14M13 18l6-6M13 6l6 6" size={15} />
        </button>
      </div>
    </div>
  )
}

export default SavingFolderView
