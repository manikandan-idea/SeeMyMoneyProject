// Record History page.
// Props:
//   state                        canonical AppState (reads state.transactions)
//   onDeleteTransaction(id)      called with ONE transaction id after confirmation
//   onUpdateTransactionAmount?(id, newAmount)  optional; enables per-record Edit
//   onBack?()                    optional back handler
// Deleting a checklist/folder never reaches here; old rows keep their snapshots.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatINR, formatDateTime } from '../../utils/format.js'
import { selectHistoryRecords, groupTransactionsByChecklistAndAmount } from '../../domain/records.js'
import RecordRow from './RecordRow.jsx'
import RecordGroup from './RecordGroup.jsx'
import './History.css'

const EMPTY = { search: '', transactionType: '', fromDate: '', toDate: '' }

function Dialog({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('input, button')?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  return (
    <div className="rec-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rec-dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function HistoryView({ state, onDeleteTransaction, onUpdateTransactionAmount, onBack }) {
  const [filters, setFilters] = useState(EMPTY)
  const [grouped, setGrouped] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [toEdit, setToEdit] = useState(null)
  const [amountText, setAmountText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const total = state?.transactions?.length || 0
  const records = useMemo(() => selectHistoryRecords(state, filters), [state, filters])
  const groups = useMemo(() => (grouped ? groupTransactionsByChecklistAndAmount(records) : []), [grouped, records])
  const filtered = Object.values(filters).some(Boolean)
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const rangeInvalid = filters.fromDate && filters.toDate && filters.fromDate > filters.toDate

  async function confirmDelete() {
    setBusy(true); setError('')
    try { await onDeleteTransaction(toDelete.id); setToDelete(null) }
    catch (e) { setError(e?.message || 'Could not delete. Nothing was changed.') }
    finally { setBusy(false) }
  }

  async function saveEdit(e) {
    e.preventDefault()
    const n = Number(amountText)
    if (!Number.isFinite(n) || n <= 0) { setError('Enter an amount greater than 0.'); return }
    setBusy(true); setError('')
    try { await onUpdateTransactionAmount(toEdit.id, n); setToEdit(null) }
    catch (err) { setError(err?.message || 'Could not save. Nothing was changed.') }
    finally { setBusy(false) }
  }

  const openEdit = onUpdateTransactionAmount ? (r) => { setToEdit(r); setAmountText(String(r.amount)); setError('') } : undefined
  const openDelete = (r) => { setToDelete(r); setError('') }

  return (
    <section className="rec-page" aria-label="Record History">
      <div className="rec-head">
        {onBack && <button type="button" className="rec-btn" onClick={onBack}>← Back</button>}
        <h2>Record History</h2>
        <span className="rec-count">{records.length}{filtered ? ` of ${total}` : ''} {total === 1 ? 'record' : 'records'}</span>
      </div>

      <div className="rec-filters">
        <input type="search" placeholder="Search description" aria-label="Search description" value={filters.search} onChange={set('search')} />
        <select aria-label="Type" value={filters.transactionType} onChange={set('transactionType')}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="saving">Saving</option>
        </select>
        <label>From <input type="date" value={filters.fromDate} onChange={set('fromDate')} /></label>
        <label>To <input type="date" value={filters.toDate} onChange={set('toDate')} /></label>
        <label className="rec-check"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group same amount</label>
        {filtered && <button type="button" className="rec-btn" onClick={() => setFilters(EMPTY)}>Clear filters</button>}
      </div>
      {rangeInvalid && <p className="rec-warn" role="alert">“From” date is after “To” date.</p>}

      {records.length === 0 ? (
        <p className="rec-empty">{total === 0 ? 'No records yet. Money you record will appear here.' : 'No records match these filters.'}</p>
      ) : grouped ? (
        <ul className="rec-list">
          {groups.map((g) => g.count === 1
            ? <RecordRow key={g.key} record={g.records[0]} onEdit={openEdit} onDelete={openDelete} />
            : <RecordGroup key={g.key} group={g} onEdit={openEdit} onDelete={openDelete} />)}
        </ul>
      ) : (
        <ul className="rec-list">
          {records.map((r) => <RecordRow key={r.id} record={r} onEdit={openEdit} onDelete={openDelete} />)}
        </ul>
      )}

      {toDelete && (
        <Dialog title="Delete this record?" onClose={() => !busy && setToDelete(null)}>
          <p><strong>{toDelete.description}</strong> · {formatINR(toDelete.amount)}<br />{formatDateTime(toDelete.recordedAt)}</p>
          <p className="rec-note">Only this one record is deleted. Its checklist and folder are not changed.</p>
          {error && <p className="rec-warn" role="alert">{error}</p>}
          <div className="rec-dialog__actions">
            <button type="button" className="rec-btn" onClick={() => setToDelete(null)} disabled={busy}>Cancel</button>
            <button type="button" className="rec-btn rec-btn--danger" onClick={confirmDelete} disabled={busy}>Delete record</button>
          </div>
        </Dialog>
      )}

      {toEdit && (
        <Dialog title="Edit amount" onClose={() => !busy && setToEdit(null)}>
          <form onSubmit={saveEdit}>
            <p><strong>{toEdit.description}</strong> · {formatDateTime(toEdit.recordedAt)}</p>
            <label className="rec-field">Amount (₹)
              <input type="number" inputMode="decimal" min="0" step="any" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            </label>
            <p className="rec-note">Changes only this record, not the checklist default.</p>
            {error && <p className="rec-warn" role="alert">{error}</p>}
            <div className="rec-dialog__actions">
              <button type="button" className="rec-btn" onClick={() => setToEdit(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="rec-btn rec-btn--primary" disabled={busy}>Save</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}

export default HistoryView
