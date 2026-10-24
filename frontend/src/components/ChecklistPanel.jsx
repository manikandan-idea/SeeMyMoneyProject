// Regular-money checklist panel for the current folder.
// Each row: static title + default amount (editable), and a ＋ icon that
// records the row's money again right now (with date & time).
// The ✏️ Edit modal lets the user add or delete rows and change amounts.

import { useEffect, useState } from 'react'
import { formatINR, formatDateTime } from '../utils/format.js'

function ChecklistPanel({ rows, onRecord, onSaveRowAmount, onDeleteRow, onAddRow }) {
  const [recording, setRecording] = useState(null) // row being recorded
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [recordError, setRecordError] = useState('')
  const [editError, setEditError] = useState('')

  // Press Escape to close whichever modal is open
  const anyModalOpen = recording !== null || editing
  useEffect(() => {
    if (!anyModalOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setRecording(null)
        setEditing(false)
        setRecordError('')
        setEditError('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [anyModalOpen])

  function openRecord(row) {
    setRecording(row)
    setAmount(String(row.amount)) // pre-filled with the default amount
    setRecordError('')
  }

  function confirmRecord(event) {
    event.preventDefault()
    if (!recording) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setRecordError('Please enter an amount greater than 0.')
      return
    }
    onRecord(recording.id, value)
    setRecording(null)
    setRecordError('')
  }

  function submitNewRow(event) {
    event.preventDefault()
    const value = Number(newAmount)
    if (!newTitle.trim()) {
      setEditError('Please enter a title for the new row.')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setEditError('Please enter a default amount greater than 0.')
      return
    }
    setEditError('')
    onAddRow(newTitle.trim(), value)
    setNewTitle('')
    setNewAmount('')
  }

  return (
    <div className="checklist">
      <div className="checklist__head">
        <h3 className="checklist__title">📋 Regular checklist</h3>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setEditing(true)
            setEditError('')
          }}
        >
          ✏️ Edit
        </button>
      </div>

      {rows.map((row) => (
        <div key={row.id} className="checklist__row">
          <div className="checklist__info">
            <span className="checklist__name">{row.title}</span>
            <span className="checklist__meta">
              default {formatINR(row.amount)}
              {row.timesRecorded > 0
                ? ` · recorded ${row.timesRecorded}× · last ${formatDateTime(row.lastRecorded.at)}`
                : ' · not recorded yet'}
            </span>
          </div>
          <button
            type="button"
            className="checklist__add"
            title="Record this row again (amount editable)"
            onClick={() => openRecord(row)}
          >
            ＋
          </button>
        </div>
      ))}

      {recording && (
        <div className="modal-backdrop" onClick={() => setRecording(null)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Record ${recording.title}`}
            onClick={(e) => e.stopPropagation()}
            onSubmit={confirmRecord}
          >
            <h3>Record: {recording.title}</h3>
            {recordError && <p className="form-error">⚠️ {recordError}</p>}
            <p className="modal__hint">
              Date &amp; time are stamped automatically: {formatDateTime(new Date().toISOString())}
            </p>
            <label className="field">
              Amount (₹) — editable
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setRecordError('')
                }}
                autoFocus
              />
            </label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setRecording(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--accent">Record</button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(false)}>
          <div
            className="modal modal--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Edit checklist"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Edit checklist</h3>
            {editError && <p className="form-error">⚠️ {editError}</p>}
            <p className="modal__hint">Title is fixed; amounts are editable. Rows can be added or deleted.</p>

            {rows.length === 0 && <p className="modal__hint">No checklist rows yet — add one below.</p>}

            {rows.map((row) => (
              <div key={row.id} className="edit-row">
                <span className="edit-row__title">{row.title}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => onSaveRowAmount(row.id, Number(event.target.value))}
                />
                <button
                  type="button"
                  className="edit-row__delete"
                  title="Delete this row"
                  onClick={() => onDeleteRow(row.id)}
                >
                  🗑
                </button>
              </div>
            ))}

            <form className="edit-row edit-row--new" onSubmit={submitNewRow}>
              <input
                placeholder="New title (e.g. Rent)"
                value={newTitle}
                onChange={(event) => {
                  setNewTitle(event.target.value)
                  setEditError('')
                }}
              />
              <input
                type="number"
                placeholder="Default ₹"
                min="0"
                step="0.01"
                value={newAmount}
                onChange={(event) => {
                  setNewAmount(event.target.value)
                  setEditError('')
                }}
              />
              <button type="submit" className="btn btn--accent btn--sm">＋ Add</button>
            </form>

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChecklistPanel
