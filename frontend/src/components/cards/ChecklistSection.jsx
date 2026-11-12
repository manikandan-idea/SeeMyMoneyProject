// "Checklists" section: heading + "+ Add checklist", the creation form (Amount first,
// name optional, Type) and the one-line checklist cards. Used inside a folder card and
// directly on a period page.
//   lists                     checklist templates to show
//   state                     AppState (for usage counts)
//   onCreate({ title, defaultAmount, transactionType })
//   actions                   { record, updateDefault, deleteChecklist }

import { useState } from 'react'
import { getChecklistUsageCount } from '../../domain/records.js'
import ChecklistRow from './ChecklistRow.jsx'
import Svg from './Svg.jsx'

const TYPE_TO_ID = { spend: 'expense', received: 'income', savings: 'saving' }

function nextName(base, names) {
  let n = names.length + 1
  while (names.includes(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function ChecklistSection({ lists, state, trail = [], actions, onCreate }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('spend')
  const [bad, setBad] = useState(false)
  const auto = nextName('Checklist', lists.map((c) => c.title))

  function openForm() { setAdding(true); setName(''); setAmount(''); setType('spend'); setBad(false) }
  function submit(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!(n > 0)) { setBad(true); return }
    onCreate({ title: name.trim() || auto, defaultAmount: Math.round(n * 100) / 100, transactionType: TYPE_TO_ID[type] })
    setAdding(false)
  }

  return (
    <div className="fc__sec">
      <div className="fc__sechead">
        <span className="fc__sectitle">Checklists</span>
        <button type="button" className="fc__ibtn" onClick={openForm}>+ Add checklist</button>
      </div>
      {adding && (
        <form className="fc__form" onSubmit={submit} aria-label="New checklist">
          <div>
            <div className="fc__lbl"><span>Amount (₹) <span style={{ color: '#c0262d' }}>*</span></span>
              <button type="button" className="fc__x" aria-label="Cancel" onClick={() => setAdding(false)}><Svg d="M18 6L6 18M6 6l12 12" /></button>
            </div>
            <div className="fc__amtwrap">
              <span>₹</span>
              <input className={`fc__in fc__amt${bad ? ' fc__in--bad' : ''}`} type="number" min="0" step="any" inputMode="decimal"
                placeholder="0" aria-label="Amount in rupees" autoFocus value={amount}
                onChange={(e) => { setAmount(e.target.value); setBad(false) }} />
            </div>
          </div>
          <div>
            <div className="fc__lbl">Checklist name <i>(optional)</i></div>
            <input className="fc__in" maxLength={30} placeholder={`Auto: ${auto}`} value={name}
              onChange={(e) => setName(e.target.value)} aria-label="Checklist name (optional)" />
          </div>
          <div>
            <div className="fc__lbl">Type</div>
            <div className="fc__types" role="group" aria-label="Transaction type">
              {['spend', 'received', 'savings'].map((t) => (
                <button key={t} type="button" aria-pressed={type === t}
                  className={`fc__type fc__type--${t}${type === t ? ' fc__type--on' : ''}`}
                  onClick={() => setType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
          <button type="submit" className="fc__create">Create Checklist</button>
        </form>
      )}
      <div className="fc__list">
        {lists.length === 0 && <div className="fc__empty">No checklists yet</div>}
        {lists.map((c) => (
          <ChecklistRow key={c.id} checklist={c} trail={trail}
            records={getChecklistUsageCount(state, c.id)}
            onRecord={(amountValue, source) => actions.record(c.id, amountValue, source)}
            onUpdateDefault={(v) => actions.updateDefault(c.id, v)}
            onDelete={() => actions.deleteChecklist(c.id)} />
        ))}
      </div>
    </div>
  )
}

export default ChecklistSection
