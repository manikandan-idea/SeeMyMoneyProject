// A Quick add checklist row. It looks and works exactly like a reusable checklist row
//   Records | ← → | name | ₹amount ✎ | Other | + | 🗑
// with ONE difference: a small ⚡ badge. It is not a reusable checklist: its records live only in
// this Saving Area, so
//   ✎ changes the amount of THESE records (nothing else changes)
//   Other adds a new row with the same name and another amount
//   +     adds one more record of exactly this row
//   🗑    removes one record (the last record removes the row)
//   ← →   undo / redo the latest record of this row
import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import Svg from './Svg.jsx'

const TYPE_LABEL = { expense: 'Spend', income: 'Received', saving: 'Savings' }

export default function QuickRow({ group, onRepeat, onRemove, onRestore, onEditAmount, onOther }) {
  const [mode, setMode] = useState(null) // null | 'amount' | 'other'
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const [flash, setFlash] = useState(false)
  const [redo, setRedo] = useState([]) // entries taken back by ←, newest last
  const last = group.entries[group.entries.length - 1]
  const type = TYPE_LABEL[last?.transactionType] ?? 'Spend'

  function open(m) { setMode(m); setValue(m === 'amount' ? String(group.amount) : ''); setBad(false) }
  function done() {
    const n = Number(value)
    if (!(n > 0)) { setBad(true); return }
    if (mode === 'amount') { if (n !== group.amount) onEditAmount(n) } else { onOther(n); setRedo([]) }
    setMode(null)
  }

  if (mode) {
    return (
      <div className="cr cr--quick">
        <span className="cr__qbadge" title="Quick add"><svg width="10" height="10" viewBox="0 0 24 24" fill="#111827" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg></span>
        <span className="cr__etitle">Amount ₹</span>
        <input className="cr__input" type="number" min="1" inputMode="decimal" autoFocus value={value}
          aria-label="Amount in rupees" style={bad ? { borderColor: '#c0262d' } : undefined}
          onChange={(e) => { setValue(e.target.value); setBad(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') setMode(null) }} />
        <button type="button" className="cr__cancel" aria-label="Cancel" onClick={() => setMode(null)}><Svg d="M18 6L6 18M6 6l12 12" /></button>
        <button type="button" className="cr__ok" onClick={done}>{mode === 'amount' ? 'Save' : 'Record'}</button>
      </div>
    )
  }
  const nextRedo = redo.length ? redo[redo.length - 1] : null
  return (
    <div className="cr cr--quick" data-quick="true">
      <span className="cr__qbadge" title="Quick add: only in this Saving Area"><svg width="10" height="10" viewBox="0 0 24 24" fill="#111827" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg></span>
      <div className="cr__count" role="status" aria-label={`Records: ${group.count}`}><b>{group.count}</b><span>Records</span></div>
      <button type="button" className="cr__sm" aria-label="Undo" disabled={!last}
        title={last ? `Undo ${formatINR(group.amount)}` : 'Nothing to undo'}
        onClick={() => { setRedo((r) => [...r, last]); onRemove() }}>
        <Svg d="M5 12h14M5 12l6 6M5 12l6-6" size={12} />
      </button>
      <button type="button" className="cr__sm" aria-label="Redo" disabled={!nextRedo}
        title={nextRedo ? `Redo ${formatINR(group.amount)}` : 'Nothing to redo'}
        onClick={() => { onRestore(nextRedo); setRedo((r) => r.slice(0, -1)) }}>
        <Svg d="M5 12h14M13 18l6-6M13 6l6 6" size={12} />
      </button>
      <span className="cr__name" title={`${group.titleSnapshot} · ${type} · Quick add`}>{group.titleSnapshot}</span>
      <button type="button" className="cr__def" aria-label="Edit amount" onClick={() => open('amount')}>
        {formatINR(group.amount)}
        <span className="cr__pencil"><Svg d="M4 20h4L18.5 9.5a2.8 2.8 0 1 0-4-4L4 16v4M13.5 6.5l4 4" size={14} /></span>
      </button>
      <button type="button" className="cr__other" aria-label="Add a new row with a different amount"
        title="Add a new row below with a different amount" onClick={() => open('other')}>Other</button>
      <button type="button" className="cr__rec" title={`Add ${formatINR(group.amount)}`}
        aria-label={`Add a record of ${formatINR(group.amount)}`}
        onClick={() => { onRepeat(); setRedo([]); setFlash(true); setTimeout(() => setFlash(false), 800) }}>
        {flash ? '✓' : '+'}
      </button>
      <button type="button" className="cr__del" aria-label="Remove one record" title="Remove one record"
        onClick={() => { onRemove(); setRedo([]) }}>
        <Svg d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      </button>
    </div>
  )
}
