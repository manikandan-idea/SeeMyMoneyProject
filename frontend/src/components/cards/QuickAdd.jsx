// Quick add: a button next to a page heading + a bottom sheet that puts ONE one-off checklist
// record straight into this page's / folder's Saving Area (never into the Checklists list or any
// container). Undo / redo go through the page's history (the ← → of its Saving Area).
import { useEffect, useRef, useState } from 'react'
import { quickAddAutoName } from '../../domain/folderChecklist.js'
import './quickAdd.css'

const TYPES = [
  { id: 'expense', label: 'Spend' },
  { id: 'income', label: 'Received' },
  { id: 'saving', label: 'Savings' },
]
const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6z'

function Bolt({ size = 18, color = '#fbbf24' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true"><path d={BOLT} /></svg>
}

export default function QuickAdd({ state, ownerId, history, where }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('expense')
  const [records, setRecords] = useState('1')
  const [advanced, setAdvanced] = useState(false)
  const [toast, setToast] = useState(null) // { ids }
  const amountRef = useRef(null)
  const toastTimer = useRef(null)

  const amt = Number(String(amount).replace(/,/g, ''))
  const amountOk = String(amount).trim() !== '' && Number.isFinite(amt) && amt > 0
  const recNum = Number(records)
  const recordsOk = String(records).trim() !== '' && Number.isInteger(recNum) && recNum >= 1
  const canAdd = amountOk && recordsOk
  const autoName = quickAddAutoName(state, ownerId)

  useEffect(() => { // the page behind is frozen while the sheet is open
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function openSheet() { setName(''); setAmount(''); setType('expense'); setRecords('1'); setAdvanced(false); setOpen(true) }
  function close() { setOpen(false) } // closing or cancelling changes nothing

  function submit() {
    if (!canAdd) return
    const ids = history.quickAdd({ name, amount: amt, transactionType: type, records: recNum })
    setOpen(false)
    setToast({ ids })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }
  function undo() {
    if (toast) history.undoQuick(toast.ids)
    setToast(null)
    clearTimeout(toastTimer.current)
  }

  return (
    <>
      <button type="button" className="qa-btn" onClick={openSheet}><Bolt />Quick add</button>

      {toast && (
        <div className="qa-toast" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
          <span className="qa-toast__msg">Added to Saving Area</span>
          <button type="button" className="qa-toast__undo" onClick={undo}>Undo</button>
        </div>
      )}

      {open && (
        <div className="qa-dim" onClick={close}>
          <div className="qa-sheet" role="dialog" aria-modal="true" aria-label="Quick add" onClick={(e) => e.stopPropagation()}>
            <div className="qa-grab" />
            <div className="qa-head">
              <div className="qa-head__title"><Bolt size={22} color="#f59e0b" /><h2>Quick add</h2></div>
              <button type="button" className="qa-x" aria-label="Close" onClick={close}>✕</button>
            </div>
            <div className="qa-where">📁 <span>Goes straight to {where}</span></div>

            <div className="qa-field">
              <label htmlFor="qa-name">Name <span className="qa-muted">· optional</span></label>
              <input id="qa-name" type="text" autoFocus value={name} placeholder={autoName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); amountRef.current?.focus() } }} />
              {!name.trim() && <div className="qa-hint">Leave blank and it is named “{autoName}”</div>}
            </div>

            <div className="qa-field">
              <label htmlFor="qa-amt">Amount <span className="qa-req">· required</span></label>
              <div className="qa-amount">
                <span>₹</span>
                <input id="qa-amt" ref={amountRef} type="text" inputMode="decimal" placeholder="0" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />
              </div>
              {!amountOk && <div className="qa-err">Enter an amount greater than ₹0 to add the entry</div>}
            </div>

            <div className="qa-field">
              <span className="qa-label">Type</span>
              <div className="qa-types" role="radiogroup" aria-label="Type">
                {TYPES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={type === t.id}
                    className={`qa-type qa-type--${t.id}${type === t.id ? ' is-on' : ''}`} onClick={() => setType(t.id)}>
                    {type === t.id ? '✓ ' : ''}{t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="qa-adv">
              <button type="button" className="qa-adv__toggle" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)}>
                Advanced settings {advanced ? '⌄' : '›'}
              </button>
              {!advanced && <span className="qa-muted">Records: {recordsOk ? recNum : '—'}</span>}
            </div>
            {advanced && (
              <div className="qa-field">
                <label htmlFor="qa-rec">Records</label>
                <input id="qa-rec" type="text" inputMode="numeric" value={records} onChange={(e) => setRecords(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />
                {!recordsOk
                  ? <div className="qa-err">Records must be a whole number of 1 or more</div>
                  : <div className="qa-hint">That many records of this amount are added.</div>}
              </div>
            )}

            <div className="qa-actions">
              <button type="button" className="qa-cancel" onClick={close}>Cancel</button>
              <button type="button" className="qa-add" disabled={!canAdd} onClick={submit}><Bolt />Add entry</button>
            </div>
            <div className="qa-foot">Not saved in your Checklists list – this one entry only.</div>
          </div>
        </div>
      )}
    </>
  )
}
