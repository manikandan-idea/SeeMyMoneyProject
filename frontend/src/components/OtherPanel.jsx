// "Other" panel: irregular, one-off money for the current folder.
// Amount is required; details are optional and typed manually.

import { useEffect, useState } from 'react'
import { formatINR, formatDateTime } from '../utils/format.js'

function OtherPanel({ others, onAdd }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')

  // Press Escape to close the add form
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function submit(event) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Please enter an amount greater than 0.')
      return
    }
    setError('')
    onAdd({ amount: value, details: details.trim() })
    setAmount('')
    setDetails('')
    setOpen(false)
  }

  return (
    <div className="other-panel">
      <div className="checklist__head">
        <h3 className="checklist__title">✨ Other (irregular money)</h3>
        <button
          type="button"
          className="btn btn--accent btn--sm"
          onClick={() => {
            setOpen(true)
            setError('')
          }}
        >
          + Other
        </button>
      </div>

      {others.length === 0 ? (
        <p className="other-panel__empty">No irregular entries yet.</p>
      ) : (
        others.map((other) => (
          <div key={other.id} className="item-row">
            <div className="item-row__main">
              <div className="item-row__desc">{other.details || 'Other'}</div>
              <div className="item-row__date">{formatDateTime(other.recordedAt)}</div>
            </div>
            <div className="item-row__amount">{formatINR(other.amount)}</div>
          </div>
        ))
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Other — irregular money"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h3>Other — irregular money</h3>
            {error && <p className="form-error">⚠️ {error}</p>}
            <p className="modal__hint">
              Date &amp; time are stamped automatically: {formatDateTime(new Date().toISOString())}
            </p>
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
                autoFocus
              />
            </label>
            <label className="field">
              Details (optional)
              <input
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="e.g. Tea snacks for guests"
              />
            </label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--accent">Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default OtherPanel
