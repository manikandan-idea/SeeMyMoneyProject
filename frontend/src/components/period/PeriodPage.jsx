// Period page: Today / This Month / This Year / Infrequent Items / Settled Items.
// Each page shows three separate boxes (Spend, Received, Savings), a Checklist
// section and a Folders section. Data comes from the normalized AppState; money is
// always read from transaction rows (never from templates or Saving Area entries).
//
// Props:
//   state, tab ('today'|'month'|'year'|'infrequent'|'settled')
//   onTab(tab)
//   onOpenFolder(folder)                 open that folder's view (same folder, not a copy)
//   onAddFolder({ name, sectionId, usage, frequency })
//   actions.addSavingAreaEntry({ ownerFolderId, sourceType, sourceId })
//   actions = { record(checklistId, amount, source), updateChecklist(id, patch),
//               deleteChecklist(id), createChecklist({ title, defaultAmount, transactionType, frequency }) }

import { useEffect, useMemo, useState } from 'react'
import { formatINR } from '../../utils/format.js'
import ChecklistSection from '../cards/ChecklistSection.jsx'
import SavingArea from '../SavingArea.jsx'
import FolderCard from '../cards/FolderCard.jsx'
import { makeId, pageOwnerId } from '../../domain/folderChecklist.js'
import { calculatePeriodTotals, getPeriodRange } from '../../domain/analytics.js'

export const TABS = [
  { id: 'today', label: 'Today', usage: 'daily', range: 'today', empty: 'No daily items yet.' },
  { id: 'month', label: 'This Month', usage: 'monthly', range: 'month', empty: 'No monthly items yet.' },
  { id: 'year', label: 'This Year', usage: 'yearly', range: 'year', empty: 'No yearly items yet.' },
  { id: 'infrequent', label: 'Infrequent Items', usage: 'occasional', range: 'all', empty: 'No infrequent items yet.' },
  { id: 'settled', label: 'Settled Items', usage: null, range: 'all', empty: '' },
]

// Spend / Received / Savings  <->  expense / income / saving
const TYPES = [
  { id: 'expense', label: 'Spend' },
  { id: 'income', label: 'Received' },
  { id: 'saving', label: 'Savings' },
]

function AddFolderDialog({ tab, onConfirm, onCancel }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('expense') // Expense is the default
  const [frequency, setFrequency] = useState('multiple')
  const [error, setError] = useState('')
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Please enter a folder name.'); return }
    onConfirm({
      name: name.trim(),
      sectionId: type,
      usage: tab.usage,
      frequency: tab.usage === 'occasional' ? frequency : null,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Add folder"
        onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Add Folder · {tab.label}</h3>
        <label className="field">
          <span>Folder name</span>
          <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError('') }} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {tab.usage === 'occasional' && (
          <label className="field">
            <span>Use</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="multiple">Many times</option>
              <option value="once">One time</option>
            </select>
          </label>
        )}
        {error && <p className="field__error" role="alert">{error}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn">Add</button>
        </div>
      </form>
    </div>
  )
}

function PeriodPage({ state, tab: tabId, onTab, onOpenFolder, onAddFolder, onOpenSavingArea, actions, cardActions }) {
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null) // { copyId, sourceId }: a Saving Area copy being edited

  const view = useMemo(() => {
    const folders = state.folders.filter(
      (f) => !f.hidden && !f.savingCopy && f.parentFolderId === null && tab.usage && f.usage === tab.usage,
    )
    const range = getPeriodRange(tab.range)
    let totals
    if (tab.id === 'infrequent') {
      const ids = new Set(state.folders.filter((f) => f.usage === 'occasional').map((f) => f.id))
      totals = { income: 0, expense: 0, saving: 0 }
      for (const t of state.transactions) {
        if (t.folderId && ids.has(t.folderId) && totals[t.transactionType] !== undefined) {
          totals[t.transactionType] += Number(t.amount) || 0
        }
      }
    } else if (tab.id === 'settled') {
      totals = { income: 0, expense: 0, saving: 0 }
    } else {
      totals = calculatePeriodTotals(state, range)
    }
    // Checklist rows: reusable templates whose frequency matches this page.
    const folderById = new Map(state.folders.map((f) => [f.id, f]))
    const checklists = tab.usage && tab.usage !== 'occasional'
      ? state.checklists.filter((c) => c.frequency === tab.usage && c.folderId === null)
      : []
    const countIn = (id) => state.transactions.filter(
      (t) => t.checklistId === id
        && (!range.fromDate || (t.transactionDate >= range.fromDate && t.transactionDate <= range.toDate)),
    ).length
    return {
      folders, totals, folderById,
      checklists: checklists.map((c) => ({ ...c, periodCount: countIn(c.id) })),
    }
  }, [state, tab])

  return (
    <main className="period">
      <nav className="period__tabs" aria-label="Pages">
        {TABS.map((t) => (
          <button key={t.id} type="button"
            className={`period__tab${t.id === tab.id ? ' period__tab--on' : ''}`}
            aria-current={t.id === tab.id ? 'page' : undefined}
            onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="period__boxes">
        <div className="pbox pbox--expense"><span>Spend</span><strong>{formatINR(view.totals.expense)}</strong></div>
        <div className="pbox pbox--income"><span>Received</span><strong>{formatINR(view.totals.income)}</strong></div>
        <div className="pbox pbox--saving"><span>Savings</span><strong>{formatINR(view.totals.saving)}</strong></div>
      </div>

      {tab.id === 'settled' ? (
        <section className="period__card">
          <h2>Settled Items</h2>
          <p className="period__empty">
            Settled records will appear here. What exactly is shown here is not decided yet,
            so nothing is moved or hidden for now.
          </p>
        </section>
      ) : (
        <>
          {tab.usage !== 'occasional' && (
            <section className="period__card">
              <ChecklistSection lists={view.checklists} state={state} actions={cardActions} variant="page"
                onAddToSaving={(c, amount) => actions.addSavingAreaEntry({ ownerFolderId: pageOwnerId(tab.usage), sourceType: 'checklist', sourceId: c.id, ...(amount ? { amount } : {}) })}
                onCreate={(c) => cardActions.createChecklist({ ...c, folderId: null, frequency: tab.usage })} />
            </section>
          )}

          <section className="period__card">
            <div className="period__head">
              <h2>Folders</h2>
              <button type="button" className="btn" onClick={() => setAdding(true)}>Add Folder</button>
            </div>
            {view.folders.length === 0 ? (
              <p className="period__empty">{tab.empty}</p>
            ) : (
              <div className="period__list">
                {view.folders.flatMap((f) => {
                  const copy = editing && editing.sourceId === f.id
                    ? state.folders.find((x) => x.id === editing.copyId) : null
                  return [
                    <FolderCard key={f.id} state={state} folder={f} depth={0} ownerId={pageOwnerId(tab.usage)}
                      actions={cardActions} onOpenSavingArea={onOpenSavingArea}
                      onCopyEdit={() => {
                        const copyId = makeId()
                        cardActions.copyFolderToSavingArea({ folderId: f.id, ownerFolderId: pageOwnerId(tab.usage), id: copyId })
                        setEditing({ copyId, sourceId: f.id })
                      }} />,
                    copy && (
                      <FolderCard key={copy.id} state={state} folder={copy} depth={0} ownerId={pageOwnerId(tab.usage)}
                        actions={cardActions} onOpenSavingArea={onOpenSavingArea}
                        editingCopy onDone={() => setEditing(null)} />
                    ),
                  ]
                })}
              </div>
            )}
          </section>
        </>
      )}

      {tab.usage && (
        <SavingArea
          entries={state.savingAreaEntries.filter((e) => e.ownerFolderId === pageOwnerId(tab.usage))}
          choices={{
            checklists: tab.usage === 'occasional' ? [] : view.checklists,
            folders: view.folders,
          }}
          onOpen={onOpenSavingArea ? () => onOpenSavingArea(pageOwnerId(tab.usage), tab.label) : undefined}
          onAdd={({ sourceType, sourceId }) =>
            actions.addSavingAreaEntry({ ownerFolderId: pageOwnerId(tab.usage), sourceType, sourceId })}
        />
      )}

      {adding && (
        <AddFolderDialog tab={tab} onCancel={() => setAdding(false)}
          onConfirm={(p) => { setAdding(false); onAddFolder(p) }} />
      )}
    </main>
  )
}

export default PeriodPage
