// A folder opened as its own page. Same structure as the day / month / year page:
//   ← Back · folder name · Spend / Received / Savings · Checklists card · Folders card
//   (inner folders as the same page-style cards) · this folder's Saving Area card at the bottom.
// Everything works the way it does on the day page: checklist "+" / Other add to THIS folder's
// Saving Area, folder "+ Add item" adds to it, "+ Edit" edits a copy kept in it, ⋮ deletes.
import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import { calculateFolderTotals } from '../../domain/analytics.js'
import { makeId } from '../../domain/folderChecklist.js'
import { AddFolderDialog } from '../period/PeriodPage.jsx'
import SavingArea from '../SavingArea.jsx'
import ChecklistSection from './ChecklistSection.jsx'
import FolderCard from './FolderCard.jsx'
import SavingFolderView from './SavingFolderView.jsx'

function FolderPage({ state, folder, actions, onBack, onOpenSavingArea }) {
  const [adding, setAdding] = useState(false)
  const [savingOpen, setSavingOpen] = useState(false)
  const [editing, setEditing] = useState(null) // { copyId, sourceId }

  const totals = calculateFolderTotals(state, folder.id)
  const lists = state.checklists.filter((c) => c.folderId === folder.id)
  const kids = state.folders.filter((f) => f.parentFolderId === folder.id && !f.hidden && !f.savingCopy)

  return (
    <div className="fpage">
      <button type="button" className="fp__back" onClick={onBack}>← Back</button>
      {(editing || savingOpen) && <div className="screen-lock" aria-hidden="true" />}
      <h1 className="period__heading">{folder.name}</h1>

      <div className="period__boxes">
        <div className="pbox pbox--expense"><span>Spend</span><strong>{formatINR(totals.expense)}</strong></div>
        <div className="pbox pbox--income"><span>Received</span><strong>{formatINR(totals.income)}</strong></div>
        <div className="pbox pbox--saving"><span>Savings</span><strong>{formatINR(totals.saving)}</strong></div>
      </div>

      <section className="period__card">
        <ChecklistSection lists={lists} state={state} actions={actions} variant="page"
          onAddToSaving={(c, amount) => actions.addSavingAreaEntry({ ownerFolderId: folder.id, sourceType: 'checklist', sourceId: c.id, ...(amount ? { amount } : {}) })}
          onCreate={(p) => actions.createChecklist({ folderId: folder.id, sectionId: folder.sectionId, ...p })} />
      </section>

      <section className="period__card">
        <div className="period__head">
          <h2>Folders</h2>
          <button type="button" className="fc__ibtn" onClick={() => setAdding(true)}>+ Add folder</button>
        </div>
        {kids.length === 0 ? (
          <p className="period__empty">No folders yet.</p>
        ) : (
          <div className="period__list">
            {kids.flatMap((k) => {
              const copy = editing && editing.sourceId === k.id ? state.folders.find((x) => x.id === editing.copyId) : null
              return [
                <div key={k.id}>
                  <FolderCard state={state} folder={k} depth={0} ownerId={folder.id} trail={[folder.name]}
                    actions={actions} onOpenSavingArea={onOpenSavingArea}
                    onMenuDelete={() => {
                      if (window.confirm(`Delete "${k.name}"? It moves to Hidden, where you can restore it.`)) actions.hideFolder(k.id)
                    }}
                    onCopyEdit={() => {
                      const copyId = makeId()
                      actions.copyFolderToSavingArea({ folderId: k.id, ownerFolderId: folder.id, id: copyId })
                      setEditing({ copyId, sourceId: k.id })
                    }} />
                </div>,
                copy && (
                  <div key={copy.id} className="screen-lock__top">
                    <FolderCard state={state} folder={copy} depth={0} ownerId={folder.id} trail={[folder.name]}
                      actions={actions} onOpenSavingArea={onOpenSavingArea}
                      editingCopy onDone={() => setEditing(null)}
                      onBack={() => {
                        const entry = state.savingAreaEntries.find((e) => e.sourceType === 'folder' && e.sourceId === copy.id)
                        if (entry) actions.removeSavingAreaEntry(entry.id)
                        setEditing(null)
                      }} />
                  </div>
                ),
              ]
            })}
          </div>
        )}
      </section>

      {savingOpen ? (
        <div className="screen-lock__top">
          <SavingFolderView state={state} ownerId={folder.id} title={folder.name}
            onClose={() => setSavingOpen(false)}
            onAdd={(entry) => actions.addSavingAreaEntry({ ownerFolderId: folder.id, ...entry })}
            onRemove={(id) => actions.removeSavingAreaEntry(id)}
            onRestore={(entry) => actions.restoreSavingAreaEntry(entry)}
            onUpdateDefault={(id, amount) => actions.updateDefault(id, amount)}
            onUpdateEntries={(ids, amount) => actions.updateEntryAmount(ids, amount)} />
        </div>
      ) : (
        <SavingArea title={`📁 ${folder.name}`} hint="Tap to open" hideAdd
          entries={state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id)}
          choices={{ checklists: [], folders: [] }}
          onOpen={() => setSavingOpen(true)} onAdd={() => {}} />
      )}

      {adding && (
        <AddFolderDialog tab={{ label: folder.name, usage: folder.frequency ? 'occasional' : folder.usage }} lockType
          onCancel={() => setAdding(false)}
          onConfirm={(p) => {
            setAdding(false)
            actions.createFolder({
              sectionId: folder.sectionId, parentFolderId: folder.id, name: p.name,
              usage: folder.usage, frequency: folder.frequency, recordCount: p.recordCount,
            })
          }} />
      )}
    </div>
  )
}

export default FolderPage
