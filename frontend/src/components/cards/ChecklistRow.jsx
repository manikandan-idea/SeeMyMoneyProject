// One-line checklist card (card_records.html):
//   Records | ← → | name | ₹default ✎ | Other | + | 🗑
//   +       records one transaction at the default amount
//   amount  edit the reusable default (future records only; old records keep their amount)
//   Other   asks for a different amount, then ADDS A NEW ROW directly below with the same
//           name; that amount is the new row's first record AND its default
//   ← / →   undo / redo the latest record of THIS row (undo removes that transaction,
//           redo puts the very same transaction back)
//   🗑      with 2 or more records it removes ONE record (the latest); with 0 or 1 record
//           it deletes the reusable checklist (every record already made stays in History)
// Records box = the real number of recorded transactions for this checklist.
//
// Props: checklist, records, latestTx, trail, onRecord(amount, source), onUpdateDefault(n),
//        onOther(amount), onRemoveRecord(txId), onRestoreRecord(tx), onDelete()

import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import Svg from './Svg.jsx'

const TYPE_LABEL = { expense: 'Spend', income: 'Received', saving: 'Savings' }

function ChecklistRow({
  checklist, records, latestTx = null, trail = [],
  onRecord, onUpdateDefault, onOther, onRemoveRecord, onRestoreRecord, onDelete,
  // Period-page variant: no Records box, no undo/redo, "+" adds the checklist to the page's
  // Saving Area (onAddToSaving) and Delete lives in a ⋮ overflow menu.
  variant = 'default', onAddToSaving,
}) {
  const isPage = variant === 'page'
  const [menu, setMenu] = useState(false)
  const [mode, setMode] = useState(null) // null | 'default' | 'other'
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const [flash, setFlash] = useState(false)
  const [redo, setRedo] = useState([]) // transactions removed by Undo, newest last

  function open(m) { setMode(m); setValue(m === 'default' ? String(checklist.defaultAmount) : ''); setBad(false) }
  function done() {
    const n = Number(value)
    if (!(n > 0)) { setBad(true); return }
    if (mode === 'default') {
      if (n !== checklist.defaultAmount) onUpdateDefault(n)
    } else {
      onOther(n)
      setRedo([])
    }
    setMode(null)
  }
  function undo() {
    if (!latestTx) return
    onRemoveRecord(latestTx.id)
    setRedo((r) => [...r, latestTx])
  }
  function redoIt() {
    if (!redo.length) return
    onRestoreRecord(redo[redo.length - 1])
    setRedo((r) => r.slice(0, -1))
  }
  function trash() {
    if (records > 1 && latestTx) { onRemoveRecord(latestTx.id); setRedo([]) }
    else onDelete()
  }

  const nextRedo = redo.length ? redo[redo.length - 1] : null
  const count = checklist.recordCount ?? 1
  const tip = [...trail, checklist.title].join(' - ')
    + ` · ${TYPE_LABEL[checklist.transactionType] || 'Spend'}`
    + (count > 1 ? ` · Record count ${count}` : '')
  const trashTitle = records > 1 ? 'Remove one record' : 'Delete this checklist'

  if (mode) {
    return (
      <div className="cr">
        <span className="cr__etitle">{mode === 'default' ? 'Default ₹' : 'Amount ₹'}</span>
        <input className="cr__input" type="number" min="1" inputMode="decimal" autoFocus value={value}
          aria-label="Amount in rupees" style={bad ? { borderColor: '#c0262d' } : undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setMode(null) }} />
        <button type="button" className="cr__cancel" aria-label="Cancel" onClick={() => setMode(null)}>
          <Svg d="M18 6L6 18M6 6l12 12" />
        </button>
        <button type="button" className="cr__ok" onClick={done}>{mode === 'default' ? 'Save' : 'Record'}</button>
      </div>
    )
  }
  if (isPage) {
    return (
      <div className="cr">
        <span className="cr__name" title={tip}>{checklist.title}</span>
        <button type="button" className="cr__def" aria-label="Edit default amount" onClick={() => open('default')}>
          {formatINR(checklist.defaultAmount)}
          <span className="cr__pencil"><Svg d="M4 20h4L18.5 9.5a2.8 2.8 0 1 0-4-4L4 16v4M13.5 6.5l4 4" size={14} /></span>
        </button>
        <button type="button" className="cr__other" aria-label="Add to Saving Area with a different amount"
          title="Add to the Saving Area with a different amount" onClick={() => open('other')}>Other</button>
        <button type="button" className="cr__rec" title="Add to Saving Area" aria-label={`Add ${checklist.title} to Saving Area`}
          onClick={() => { onAddToSaving?.(); setFlash(true); setTimeout(() => setFlash(false), 800) }}>
          {flash ? '✓' : '+'}
        </button>
        <div className="cr__menuwrap">
          <button type="button" className="cr__more" aria-label="More options" aria-haspopup="menu" aria-expanded={menu}
            onClick={() => setMenu((v) => !v)} onBlur={() => setTimeout(() => setMenu(false), 150)}>
            <Svg d="M12 5.5v.01M12 12v.01M12 18.5v.01" size={20} />
          </button>
          {menu && (
            <div className="cr__menu" role="menu">
              <button type="button" role="menuitem" className="cr__menuitem cr__menuitem--danger"
                onClick={() => { setMenu(false); onDelete() }}>Delete checklist</button>
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="cr">
      <div className="cr__count" role="status" aria-label={`Records: ${records}`}><b>{records}</b><span>Records</span></div>
      <button type="button" className="cr__sm" aria-label="Undo" disabled={!latestTx}
        title={latestTx ? `Undo ${formatINR(latestTx.amount)}` : 'Nothing to undo'} onClick={undo}>
        <Svg d="M5 12h14M5 12l6 6M5 12l6-6" size={12} />
      </button>
      <button type="button" className="cr__sm" aria-label="Redo" disabled={!nextRedo}
        title={nextRedo ? `Redo ${formatINR(nextRedo.amount)}` : 'Nothing to redo'} onClick={redoIt}>
        <Svg d="M5 12h14M13 18l6-6M13 6l6 6" size={12} />
      </button>
      <span className="cr__name" title={tip}>{checklist.title}</span>
      <button type="button" className="cr__def" aria-label="Edit default amount" onClick={() => open('default')}>
        {formatINR(checklist.defaultAmount)}
        <span className="cr__pencil"><Svg d="M4 20h4L18.5 9.5a2.8 2.8 0 1 0-4-4L4 16v4M13.5 6.5l4 4" size={14} /></span>
      </button>
      <button type="button" className="cr__other" aria-label="Record a different amount (adds a new row below)"
        title="Add a new row below with a different amount" onClick={() => open('other')}>Other</button>
      <button type="button" className="cr__rec" title={`Add ${formatINR(checklist.defaultAmount)}`}
        aria-label={`Add a record of ${formatINR(checklist.defaultAmount)}`}
        onClick={() => { onRecord(checklist.defaultAmount, 'checklist'); setRedo([]); setFlash(true); setTimeout(() => setFlash(false), 800) }}>
        {flash ? '✓' : '+'}
      </button>
      <button type="button" className="cr__del" aria-label={trashTitle} title={trashTitle} onClick={trash}>
        <Svg d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      </button>
    </div>
  )
}

export default ChecklistRow
