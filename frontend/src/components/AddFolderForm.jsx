// "New folder" modal.
// The user declares: name, Daily vs Occasional usage, (if Occasional)
// one-time vs multiple-use, optional "Other" row, optional checklist
// builder (rows = fixed title + default amount).

import { useEffect, useState } from 'react'

function AddFolderForm({ onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [usage, setUsage] = useState('') // '' | 'daily' | 'occasional'
  const [frequency, setFrequency] = useState('') // '' | 'once' | 'multiple'
  const [othersEnabled, setOthersEnabled] = useState(false)
  const [wantChecklist, setWantChecklist] = useState(false)
  const [rows, setRows] = useState([]) // { title, amount }
  const [rowTitle, setRowTitle] = useState('')
  const [rowAmount, setRowAmount] = useState('')
  const [error, setError] = useState('')

  // Clear the error as soon as the user fixes any required field
  function updateName(value) {
    setName(value)
    setError('')
  }

  function updateUsage(value) {
    setUsage(value)
    setError('')
  }

  function updateFrequency(value) {
    setFrequency(value)
    setError('')
  }

  // Press Escape to close the modal
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  function addRow() {
    const value = Number(rowAmount)
    if (!rowTitle.trim() || !Number.isFinite(value) || value <= 0) return
    setRows([...rows, { title: rowTitle.trim(), amount: value }])
    setRowTitle('')
    setRowAmount('')
  }

  function removeRow(index) {
    setRows(rows.filter((_, i) => i !== index))
  }

  function submit(event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Please enter a folder name.')
      return
    }
    if (!usage) {
      setError('Please choose how this folder is used — Every day, Every month, Every year or Occasionally.')
      return
    }
    if (usage === 'occasional' && !frequency) {
      setError('Please choose One-time or Multiple-use for this occasional folder.')
      return
    }
    setError('')
    onConfirm({
      name: name.trim(),
      usage,
      frequency: usage === 'occasional' ? frequency : null,
      othersEnabled,
      checklist: wantChecklist ? rows : [],
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="New folder"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>New folder</h3>

        {error && <p className="form-error">⚠️ {error}</p>}

        <label className="field">
          Folder name
          <input
            value={name}
            onChange={(event) => updateName(event.target.value)}
            placeholder="e.g. Daily Tea & Auto"
            autoFocus
          />
        </label>

        <fieldset className="field">
          <legend>This folder is used…</legend>
          <label className="choice">
            <input
              type="radio"
              name="usage"
              checked={usage === 'daily'}
              onChange={() => updateUsage('daily')}
            />
            Every day — auto-submits daily, fresh checklist each morning
          </label>
          <label className="choice">
            <input
              type="radio"
              name="usage"
              checked={usage === 'monthly'}
              onChange={() => updateUsage('monthly')}
            />
            Every month — auto-submits on the first open of a new month
          </label>
          <label className="choice">
            <input
              type="radio"
              name="usage"
              checked={usage === 'yearly'}
              onChange={() => updateUsage('yearly')}
            />
            Every year — auto-submits on the first open of a new year
          </label>
          <label className="choice">
            <input
              type="radio"
              name="usage"
              checked={usage === 'occasional'}
              onChange={() => updateUsage('occasional')}
            />
            Occasionally — submits only when I press Submit
          </label>
        </fieldset>

        {usage === 'occasional' && (
          <fieldset className="field">
            <legend>Occasional use…</legend>
            <label className="choice">
              <input
                type="radio"
                name="frequency"
                checked={frequency === 'once'}
                onChange={() => updateFrequency('once')}
              />
              One-time — folder deletes itself after submit
            </label>
            <label className="choice">
              <input
                type="radio"
                name="frequency"
                checked={frequency === 'multiple'}
                onChange={() => updateFrequency('multiple')}
              />
              Multiple-use — folder hides after submit
            </label>
          </fieldset>
        )}

        <label className="choice">
          <input
            type="checkbox"
            checked={othersEnabled}
            onChange={(event) => setOthersEnabled(event.target.checked)}
          />
          Include “Other” row for irregular money
        </label>

        <label className="choice">
          <input
            type="checkbox"
            checked={wantChecklist}
            onChange={(event) => setWantChecklist(event.target.checked)}
          />
          Add regular money checklist
        </label>

        {wantChecklist && (
          <div className="row-builder">
            <p className="modal__hint">
              Rows have a fixed title + default amount (editable later, recorded with the ＋ icon).
            </p>
            {rows.map((row, index) => (
              <div key={`${row.title}-${index}`} className="row-builder__row">
                <span className="row-builder__summary">
                  {row.title} — ₹{row.amount}
                </span>
                <button type="button" onClick={() => removeRow(index)} title="Remove row">
                  🗑
                </button>
              </div>
            ))}
            <div className="row-builder__row">
              <input
                placeholder="Title (e.g. Rent)"
                value={rowTitle}
                onChange={(event) => setRowTitle(event.target.value)}
              />
              <input
                type="number"
                placeholder="Default ₹"
                min="0"
                step="0.01"
                value={rowAmount}
                onChange={(event) => setRowAmount(event.target.value)}
              />
              <button type="button" onClick={addRow} title="Add row">＋</button>
            </div>
          </div>
        )}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--accent">Create folder</button>
        </div>
      </form>
    </div>
  )
}

export default AddFolderForm
