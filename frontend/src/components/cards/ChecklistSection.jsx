// "Checklists" section: heading + "+ Add checklist", the creation form (Amount first,
// name optional, Type, Advanced settings -> Record count) and the one-line checklist
// cards. Used inside a folder card and directly on a period page.
//   lists                     checklist templates to show
//   state                     AppState (for record counts / latest record)
//   onCreate({ id, title, defaultAmount, transactionType, recordCount })
//   actions                   { record, updateDefault, deleteChecklist, recordOtherRow,
//                               removeRecord, restoreRecord }
//   variant                   'page' = period-page rows (no Records box / undo / redo, + adds to
//                             the Saving Area, Delete in a ⋮ menu). Folder cards keep 'default'.
//   onAddToSaving(checklist, amount?)  page variant: the + button (default amount) and
//                             Other > Record (typed amount, no new checklist, no transaction)
//   onHistory(action)         optional; a folder card passes its history logger so its
//                             ← → arrows can undo / redo what happens here. Without it
//                             (period page) deleting a checklist asks for confirmation.

import { useRef, useState } from 'react'
import { getLatestChecklistTransaction } from '../../domain/records.js'
import { checklistRecordCount } from '../../domain/analytics.js'
import { makeId } from '../../domain/folderChecklist.js'
import AdvancedSettings, { parseRecordCount } from './AdvancedSettings.jsx'
import ChecklistRow from './ChecklistRow.jsx'
import QuickRow from './QuickRow.jsx'

const TYPE_TO_ID = { spend: 'expense', received: 'income', savings: 'saving' }

function nextName(base, names) {
  let n = names.length + 1
  while (names.includes(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function ChecklistSection({ lists, state, trail = [], actions, onCreate, onHistory, variant = 'default', onAddToSaving, hideAdd = false, quickGroups = [], onQuickRepeat, onQuickRemove, onQuickRestore, onQuickEditAmount, onQuickOther }) {
  const nameRef = useRef(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('spend')
  const [bad, setBad] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const [rc, setRc] = useState('1')
  const [rcBad, setRcBad] = useState(false)
  const auto = nextName('Checklist', lists.map((c) => c.title))

  function openForm() {
    setAdding(true); setName(''); setAmount(''); setType('spend'); setBad(false)
    setAdvOpen(false); setRc('1'); setRcBad(false)
  }
  function submit(e) {
    e.preventDefault()
    const n = Number(amount)
    if (!(n > 0)) { setBad(true); return }
    const count = parseRecordCount(rc)
    if (count === null) { setAdvOpen(true); setRcBad(true); return }
    const id = makeId()
    onCreate({
      id, title: name.trim() || auto, defaultAmount: Math.round(n * 100) / 100,
      transactionType: TYPE_TO_ID[type], recordCount: count,
      ...(variant === 'page' ? {} : { baseRecord: count }),
    })
    onHistory?.({ t: 'addC', id })
    setAdding(false)
  }

  // Trash at 0 / 1 record: delete the reusable checklist only (records stay in History).
  function removeRow(c) {
    if (!onHistory && !window.confirm(`Delete the checklist “${c.title}”? Only the reusable checklist is removed. Everything already recorded stays in History.`)) return
    const index = state.checklists.findIndex((x) => x.id === c.id)
    actions.deleteChecklist(c.id)
    onHistory?.({ t: 'delC', snap: { row: c, index, txs: [] } })
  }
  // "Other": a NEW row with the same name goes directly below; the amount typed is its
  // first record and its default.
  function addOtherRow(c, amountValue) {
    const id = makeId()
    actions.recordOtherRow({ sourceId: c.id, newId: id, amount: amountValue })
    onHistory?.({ t: 'addC', id, withRecords: true })
  }

  return (
    <div className="fc__sec">
      <div className="fc__sechead">
        <span className="fc__sectitle">Checklists</span>
        {!hideAdd && <button type="button" className="fc__ibtn" onClick={openForm}>+ Add checklist</button>}
      </div>
      {adding && !hideAdd && (
        <form className="fc__form fc__form--sheet" onSubmit={submit} aria-label="New checklist"
          onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }}>
          <div>
            <div className="fc__lbl"><span>Amount (₹)</span></div>
            <div className="fc__amtwrap">
              <span>₹</span>
              <input className={`fc__in fc__amt${bad ? ' fc__in--bad' : ''}`} type="number" min="0" step="any" inputMode="decimal"
                placeholder="0" aria-label="Amount in rupees" autoFocus value={amount}
                onChange={(e) => { setAmount(e.target.value); setBad(false) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nameRef.current?.focus() } }} />
            </div>
            <div className="fc__chips" role="group" aria-label="Quick amounts">
              {[10, 20, 50, 100, 500].map((v) => (
                <button key={v} type="button" className="fc__chip" onClick={() => { setAmount(String(v)); setBad(false) }}>₹{v}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="fc__lbl">Checklist name <i>optional</i></div>
            <input ref={nameRef} className="fc__in" maxLength={30} placeholder={`Auto: ${auto}`} value={name}
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
          <AdvancedSettings open={advOpen} onToggle={() => setAdvOpen((v) => !v)} value={rc} bad={rcBad}
            onChange={(v) => { setRc(v); setRcBad(false) }} />
          <button type="submit" className="fc__create">Create Checklist</button>
          <p className="fc__hint">Enter moves to the next field. Enter on the last one creates it.</p>
        </form>
      )}
      <div className="fc__list">
        {lists.length === 0 && quickGroups.length === 0 && <div className="fc__empty">No checklists yet</div>}
        {lists.map((c) => (
          <ChecklistRow key={c.id} checklist={c} trail={trail} variant={variant}
            onAddToSaving={() => onAddToSaving?.(c)}
            records={checklistRecordCount(state, c)}
            latestTx={getLatestChecklistTransaction(state, c.id)}
            onRecord={(amountValue, source) => actions.record(c.id, amountValue, source)}
            onUpdateDefault={(v) => {
              onHistory?.({ t: 'amt', id: c.id, from: c.defaultAmount, to: v })
              actions.updateDefault(c.id, v)
            }}
            onOther={(amountValue) => (variant === 'page' ? onAddToSaving?.(c, amountValue) : addOtherRow(c, amountValue))}
            onRemoveRecord={(txId) => actions.removeRecord(txId)}
            onRestoreRecord={(tx) => actions.restoreRecord(tx)}
            onDelete={() => removeRow(c)} />
        ))}
        {quickGroups.map((g) => (
          <QuickRow key={g.key} group={g} onRepeat={() => onQuickRepeat?.(g)} onRemove={() => onQuickRemove?.(g)}
            onRestore={(entry) => onQuickRestore?.(entry)} onEditAmount={(n) => onQuickEditAmount?.(g, n)} onOther={(n) => onQuickOther?.(g, n)} />
        ))}
      </div>
    </div>
  )
}

export default ChecklistSection
