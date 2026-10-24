// "New entry" modal. Date & time are stamped automatically on save —
// no manual date picker (records always carry the moment they were entered).

import { useEffect, useState } from 'react'
import { formatDateTime } from '../utils/format.js'

function AddForm({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  // Press Escape to close the modal
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Please enter a description.')
      return
    }
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Please enter an amount greater than 0.')
      return
    }
    setError('')
    onConfirm({ description: name.trim(), amount: value })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New entry"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3>New entry</h3>
        {error && <p className="form-error">⚠️ {error}</p>}
        <p className="modal__hint">
          Date &amp; time are stamped automatically: {formatDateTime(new Date().toISOString())}
        </p>
        <label className="field">
          Description
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
            placeholder="e.g. Groceries"
            autoFocus
          />
        </label>
        <label className="field">
          Amount (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              setError('')
            }}
            placeholder="e.g. 1500"
          />
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--accent">Add</button>
        </div>
      </form>
    </div>
  )
}

export default AddForm
