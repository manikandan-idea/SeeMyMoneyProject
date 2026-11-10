// Reusable checklist panel for the OPEN folder.
// Row controls (all optional-callback driven; this component stores no money):
//   ＋ ₹<default>  record once at the default amount          -> onRecord(checklistId)
//   Other          one-time amount, default NOT changed       -> onRecordOther(checklistId, amount)
//   ✏️             edit the reusable default (future uses)     -> onUpdateDefault(checklistId, amount)
//   🐖             add this checklist to the folder's Saving Area -> onAddToSavingArea(checklistId)
// Deleting a checklist lives inside the ✏️ dialog and removes ONLY the template.
// "Add Checklist" creates a new reusable checklist -> onAdd(title, defaultAmount, type). Type defaults to `defaultType` (Spend).

import { useEffect, useState } from 'react'
import { formatINR } from '../utils/format.js'
import './folders.css'

function parseAmount(text) {
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

function ChecklistPanel({
  rows,
  getUsageCount,
  canAddToSavingArea = true,
  onRecord,
  onRecordOther,
  onUpdateDefault,
  onDelete,
  onAdd,
  onAddToSavingArea,
  defaultType = 'expense',
}) {
  const [dialog, setDialog] = useState(null) // { kind: 'other' | 'default' | 'add', row? }
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState(defaultType)
  const [error, setError] = useState('')

  const open = dialog !== null
  function close() {
    setDialog(null)
    setError('')
  }

  // Escape closes the dialog
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setDialog(null)
        setError('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function openDialog(kind, row) {
    setDialog({ kind, row })
    setAmount(row ? String(row.defaultAmount) : '')
    setTitle('')
    setType(defaultType)
    setError('')
  }

  function submit(event) {
    event.preventDefault()
    const value = parseAmount(amount)
    if (dialog.kind === 'add' && !title.trim()) {
      setError('Please enter a checklist title.')
      return
    }
    if (value === null) {
      setError('Please enter an amount greater than 0.')
      return
    }
    if (dialog.kind === 'other') onRecordOther(dialog.row.id, value)
    else if (dialog.kind === 'default') onUpdateDefault(dialog.row.id, value)
    else onAdd(title.trim(), value, type)
    close()
  }

  function confirmDelete() {
    const row = dialog.row
    const ok = window.confirm(
      `Delete the checklist “${row.title}”? Only the reusable checklist is removed — everything already recorded stays in History.`,
    )
    if (!ok) return
    onDelete(row.id)
    close()
  }

  const heading =
    dialog?.kind === 'other'
      ? `Other amount: ${dialog.row.title}`
      : dialog?.kind === 'default'
        ? `Default amount: ${dialog.row.title}`
        : 'Add Checklist'

  return (
    <div className="checklist">
      <div className="checklist__head">
        <h3 className="checklist__title">📋 Regular checklist</h3>
        <button type="button" className="btn btn--accent btn--sm" onClick={() => openDialog('add')}>
          Add Checklist
        </button>
      </div>

      {rows.length === 0 && (
        <p className="other-panel__empty">No checklists in this folder yet — use “Add Checklist”.</p>
      )}

      {rows.map((row) => {
        const used = getUsageCount ? getUsageCount(row.id) : null
        return (
          <div key={row.id} className="checklist__row">
            <div className="checklist__info">
              <span className="checklist__name">{row.title}</span>
              <span className="checklist__meta">
                default {formatINR(row.defaultAmount)}
                {used === null ? '' : used > 0 ? ` · used ${used}×` : ' · not used yet'}
              </span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="pill pill--primary"
                title={`Record ${row.title} at the default amount`}
                aria-label={`Record ${row.title} for ${formatINR(row.defaultAmount)}`}
                onClick={() => onRecord(row.id)}
              >
                ＋ {formatINR(row.defaultAmount)}
              </button>
              <button
                type="button"
                className="pill"
                title="Record a different amount once (the default stays)"
                aria-label={`Other amount for ${row.title}`}
                onClick={() => openDialog('other', row)}
              >
                Other
              </button>
              <button
                type="button"
                className="pill pill--icon"
                title="Edit the reusable default amount (future records only)"
                aria-label={`Edit default amount for ${row.title}`}
                onClick={() => openDialog('default', row)}
              >
                ✏️
              </button>
              {canAddToSavingArea && (
                <button
                  type="button"
                  className="pill pill--icon"
                  title="Add to this folder's Saving Area"
                  aria-label={`Add ${row.title} to Saving Area`}
                  onClick={() => onAddToSavingArea(row.id)}
                >
                  🐖
                </button>
              )}
            </div>
          </div>
        )
      })}

      {open && (
        <div className="modal-backdrop" onClick={close}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={heading}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h3>{heading}</h3>
            {error && <p className="form-error">⚠️ {error}</p>}
            {dialog.kind === 'other' && (
              <p className="modal__hint">One-time amount. The checklist’s default stays {formatINR(dialog.row.defaultAmount)}.</p>
            )}
            {dialog.kind === 'default' && (
              <p className="modal__hint">Changes future records only — past records keep their amounts.</p>
            )}
            {dialog.kind === 'add' && (
              <label className="field">
                Title
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    setError('')
                  }}
                  placeholder="e.g. Tea"
                  autoFocus
                />
              </label>
            )}
            {dialog.kind === 'add' && (
              <label className="field">
                Type
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="expense">Spend</option>
                  <option value="income">Received</option>
                  <option value="saving">Savings</option>
                </select>
              </label>
            )}
            <label className="field">
              {dialog.kind === 'add' ? 'Default amount (₹)' : 'Amount (₹)'}
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setError('')
                }}
                autoFocus={dialog.kind !== 'add'}
              />
            </label>
            <div className="modal__actions">
              {dialog.kind === 'default' && (
                <button type="button" className="btn btn--danger" onClick={confirmDelete}>
                  🗑 Delete checklist
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn--accent">
                {dialog.kind === 'other' ? 'Record' : dialog.kind === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default ChecklistPanel
