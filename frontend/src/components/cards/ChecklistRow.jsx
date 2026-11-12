// One-line checklist card (card_records.html):  Records | name | ₹default ✎ | Other | + | 🗑
//   +      records one transaction at the default amount
//   amount edit the reusable default (future records only; old records keep their amount)
//   Other  records ONE transaction with a different amount (the default is unchanged)
//   🗑     deletes only the reusable checklist after a confirmation; every record
//          already made stays in History
// Records box = the real number of recorded transactions for this checklist.
// Not ported (would change saved money or need a decision): ← → undo/redo of records,
// "Other" creating a second card, and 🗑 removing one record.

import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import Svg from './Svg.jsx'

function ChecklistRow({ checklist, records, trail = [], onRecord, onUpdateDefault, onDelete }) {
  const [mode, setMode] = useState(null) // null | 'default' | 'other'
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const [flash, setFlash] = useState(false)

  function open(m) { setMode(m); setValue(m === 'default' ? String(checklist.defaultAmount) : ''); setBad(false) }
  function done() {
    const n = Number(value)
    if (!(n > 0)) { setBad(true); return }
    if (mode === 'default') { if (n !== checklist.defaultAmount) onUpdateDefault(n) }
    else onRecord(n, 'checklist-other')
    setMode(null)
  }
  function remove() {
    if (window.confirm(`Delete the checklist “${checklist.title}”? Only the reusable checklist is removed. Everything already recorded stays in History.`)) onDelete()
  }
  const tip = [...trail, checklist.title].join(' - ')

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
  return (
    <div className="cr">
      <div className="cr__count" role="status" aria-label={`Records: ${records}`}><b>{records}</b><span>Records</span></div>
      <span className="cr__name" title={tip}>{checklist.title}</span>
      <button type="button" className="cr__def" aria-label="Edit default amount" onClick={() => open('default')}>
        {formatINR(checklist.defaultAmount)}
        <span style={{ color: '#777', display: 'inline-flex' }}><Svg d="M4 20h4L18.5 9.5a2.8 2.8 0 1 0-4-4L4 16v4M13.5 6.5l4 4" size={14} /></span>
      </button>
      <button type="button" className="cr__other" aria-label="Record a different amount" onClick={() => open('other')}>Other</button>
      <button type="button" className="cr__rec" title={`Add ${formatINR(checklist.defaultAmount)}`}
        aria-label={`Add a record of ${formatINR(checklist.defaultAmount)}`}
        onClick={() => { onRecord(checklist.defaultAmount, 'checklist'); setFlash(true); setTimeout(() => setFlash(false), 800) }}>
        {flash ? '✓' : '+'}
      </button>
      <button type="button" className="cr__del" aria-label="Delete this checklist" title="Delete" onClick={remove}>
        <Svg d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      </button>
    </div>
  )
}

export default ChecklistRow
