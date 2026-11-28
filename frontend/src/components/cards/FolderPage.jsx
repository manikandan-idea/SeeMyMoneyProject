// A folder opened as its own page. Same structure as the day / month / year page:
//   ← Back · folder name · Spend / Received / Savings · Checklists card · Folders card
//   (inner folders as the same page-style cards) · this folder's Saving Area card at the bottom.
// Everything works the way it does on the day page: checklist "+" / Other add to THIS folder's
// Saving Area, folder "+ Add item" adds to it, "+ Edit" edits a copy kept in it, ⋮ deletes.
import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import { calculateFolderView } from '../../domain/analytics.js'
import { useEntryHistory } from './entryHistory.js'
import { makeId } from '../../domain/folderChecklist.js'
import { AddFolderDialog } from '../period/PeriodPage.jsx'
import SavingArea from '../SavingArea.jsx'
import ChecklistSection from './ChecklistSection.jsx'
import FolderCard from './FolderCard.jsx'
import SavingFolderView from './SavingFolderView.jsx'
import QuickAdd from './QuickAdd.jsx'
import CopyEditor from './CopyEditor.jsx'
import { ShrinkButton, ShrinkCount, ShrinkList } from './ShrinkCard.jsx'

function FolderPage({ state, folder, actions, onBack, onOpenSavingArea }) {
  const [adding, setAdding] = useState(false)
  const [foldersShrunk, setFoldersShrunk] = useState(false) // Shrink / Expand button of the Folders card
  const [savingOpen, setSavingOpen] = useState(false)
  const [editing, setEditing] = useState(null) // { copyId, sourceId }

  const pageHistory = useEntryHistory(folder.id, actions, state)
  const totals = calculateFolderView(state, folder.id)
  const lists = state.checklists.filter((c) => c.folderId === folder.id)
  const kids = state.folders.filter((f) => f.parentFolderId === folder.id && !f.hidden && !f.savingCopy)

  return (
    <div className="fpage">
      <button type="button" className="fp__back" onClick={onBack}>← Back</button>
      {(editing || savingOpen) && <div className="screen-lock" aria-hidden="true" />}
      <div className="qa-headrow">
        <h1 className="period__heading">{folder.name}</h1>
        <QuickAdd state={state} ownerId={folder.id} history={pageHistory} where={`${folder.name}’s Saving Area`} />
      </div>

      <div className="period__boxes">
        <div className="pbox pbox--expense"><span>Spend</span><strong>{formatINR(totals.expense)}</strong></div>
        <div className="pbox pbox--income"><span>Received</span><strong>{formatINR(totals.income)}</strong></div>
        <div className="pbox pbox--saving"><span>Savings</span><strong>{formatINR(totals.saving)}</strong></div>
      </div>

      <section className="period__card">
        <ChecklistSection lists={lists} state={state} actions={actions} variant="page"
          onAddToSaving={(c, amount) => pageHistory.add({ sourceType: 'checklist', sourceId: c.id, ...(amount ? { amount } : {}) })}
          onHistory={pageHistory.logStruct}
          onCreate={(p) => actions.createChecklist({ folderId: folder.id, sectionId: folder.sectionId, ...p })} />
      </section>

      <section className="period__card">
        <div className="period__head">
          <h2>Folders<ShrinkCount n={kids.length} /></h2>
          <ShrinkButton shrunk={foldersShrunk} count={kids.length} onToggle={() => setFoldersShrunk((v) => !v)} />
          <button type="button" className="fc__ibtn" onClick={() => setAdding(true)}>+ Add folder</button>
        </div>
        {kids.length === 0 ? (
          <p className="period__empty">No folders yet.</p>
        ) : (
          <ShrinkList className="period__list" shrunk={foldersShrunk && !editing} maxHeight={150}>
            {kids.flatMap((k) => {
              const copy = editing && editing.sourceId === k.id ? state.folders.find((x) => x.id === editing.copyId) : null
              return [
                <div key={k.id}>
                  <FolderCard state={state} folder={k} depth={0} ownerId={folder.id} trail={[folder.name]}
                    actions={actions} onOpenSavingArea={onOpenSavingArea}
                    onMenuDelete={() => {
                      if (window.confirm(`Delete "${k.name}"? It moves to Hidden, where you can restore it.`)) {
                        actions.hideFolder(k.id)
                        pageHistory.logStruct({ t: 'delF', folderId: k.id })
                      }
                    }}
                    onCopyEdit={() => {
                      const copyId = makeId()
                      actions.copyFolderToSavingArea({ folderId: k.id, ownerFolderId: folder.id, id: copyId })
                      setEditing({ copyId, sourceId: k.id })
                    }} />
                </div>,
                copy && (
                  <div key={copy.id} className="screen-lock__top">
                    <CopyEditor state={state} actions={actions} onOpenSavingArea={onOpenSavingArea}
                      rootCopyId={copy.id} ownerId={folder.id} trail={[folder.name]}
                      onRootDone={() => { actions.mergeIdenticalCopy(folder.id, copy.id); setEditing(null) }}
                      onRootBack={() => {
                        const entry = state.savingAreaEntries.find((e) => e.sourceType === 'folder' && e.sourceId === copy.id)
                        if (entry) actions.removeSavingAreaEntry(entry.id)
                        setEditing(null)
                      }} />
                  </div>
                ),
              ]
            })}
          </ShrinkList>
        )}
      </section>

      {savingOpen ? (
        <div className="screen-lock__top">
          <SavingFolderView state={state} ownerId={folder.id} title={folder.name}
            onClose={() => setSavingOpen(false)} history={pageHistory} actions={actions}
            onUpdateDefault={pageHistory.updateDefault}
            onUpdateEntries={pageHistory.updateEntries} />
        </div>
      ) : (
        <SavingArea title={`📁 ${folder.name}`} hint="Tap to open" hideAdd history={pageHistory}
          entries={state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id)}
          choices={{ checklists: [], folders: [] }}
          onOpen={() => setSavingOpen(true)} onAdd={() => {}} />
      )}

      {adding && (
        <AddFolderDialog tab={{ label: folder.name, usage: folder.frequency ? 'occasional' : folder.usage }} lockType
          onCancel={() => setAdding(false)}
          onConfirm={(p) => {
            setAdding(false)
            const id = makeId()
            actions.createFolder({
              id, sectionId: folder.sectionId, parentFolderId: folder.id, name: p.name,
              usage: folder.usage, frequency: folder.frequency, recordCount: p.recordCount,
            })
            pageHistory.logStruct({ t: 'addF', folderId: id })
          }} />
      )}
    </div>
  )
}

export default FolderPage
