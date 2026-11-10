// Folder-explorer page for one section (Income / Expense / Saving), driven by the
// normalized AppState. Opening a folder just changes `currentFolderId` — the
// view is of the SAME folder entity; nothing is copied.
//
// Props (Developer 5 supplies all of these):
//   sectionId, sectionTitle, sectionIcon
//   state                AppState (read only here)
//   onBack()
//   getUsageCount(checklistId) -> number          optional (Developer 3)
//   getFolderRecords(folderId|null) -> Transaction[]  optional; null = section root
//   getTotals(folderId|null) -> { total, count }  optional (Developer 4); null = section
//   actions = {
//     createFolder({ parentFolderId, name, usage, frequency, othersEnabled, checklist })
//     updateFolder(folderId, patch)                  // permanent rename etc.
//     setFolderHidden(folderId, hidden)
//     duplicateFolder(folderId)
//     createChecklist({ folderId, title, defaultAmount })
//     updateChecklist(checklistId, patch)            // { title } or { defaultAmount }
//     deleteChecklist(checklistId)                   // template only
//     addSavingAreaEntry({ ownerFolderId, sourceType, sourceId })
//     recordChecklist({ folderId, checklistId, amount, source })  // 'checklist' | 'checklist-other'
//     recordOther({ folderId, amount, description })              // standalone, source 'other'
//     recordFolderOneTime({ folderId, amount, description })      // source 'folder-one-time'
//     addEntry({ folderId, description, amount })                 // manual, source 'manual'
//   }

import { useEffect, useMemo, useState } from 'react'
import Breadcrumb from './Breadcrumb.jsx'
import FolderCard from './FolderCard.jsx'
import ItemRow from './ItemRow.jsx'
import AddForm from './AddForm.jsx'
import AddFolderForm from './AddFolderForm.jsx'
import ChecklistPanel from './ChecklistPanel.jsx'
import OtherPanel from './OtherPanel.jsx'
import { selectFolderTree, groupSavingAreaEntries } from '../domain/folderChecklist.js'
import { formatINR } from '../utils/format.js'
import './folders.css'

function usageBadge(node) {
  if (!node.usage) return null
  if (node.usage === 'daily') return '🔁 Daily'
  if (node.usage === 'monthly') return '🗓 Monthly'
  if (node.usage === 'yearly') return '📆 Yearly'
  if (node.frequency === 'once') return '⚡ Occasional · one-time'
  return '🔁 Occasional · multi-use'
}

function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, onEscape])
}

// Folder `+ Edit`: ONE-TIME amount for this folder. Not a permanent edit.
function OneTimeDialog({ folderName, onConfirm, onCancel }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  useEscape(true, onCancel)

  function submit(event) {
    event.preventDefault()
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Please enter an amount greater than 0.')
      return
    }
    onConfirm({ amount: value, description: description.trim() })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`One-time amount for ${folderName}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>One-time amount: {folderName}</h3>
        {error && <p className="form-error">⚠️ {error}</p>}
        <p className="modal__hint">Records this amount once. The folder itself is not changed.</p>
        <label className="field">
          Amount (₹)
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
            autoFocus
          />
        </label>
        <label className="field">
          Details (optional)
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--accent">Record</button>
        </div>
      </form>
    </div>
  )
}

// Permanent pencil: rename the folder and its checklists (names only).
function RenameDialog({ folder, onSave, onCancel }) {
  const [name, setName] = useState(folder.name)
  const [titles, setTitles] = useState(() =>
    Object.fromEntries(folder.checklists.map((c) => [c.id, c.title])),
  )
  const [error, setError] = useState('')
  useEscape(true, onCancel)

  function submit(event) {
    event.preventDefault()
    if (!name.trim() || Object.values(titles).some((t) => !t.trim())) {
      setError('Names cannot be empty.')
      return
    }
    onSave({ name: name.trim(), titles })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        className="modal modal--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Edit names"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3>Edit names</h3>
        {error && <p className="form-error">⚠️ {error}</p>}
        <p className="modal__hint">Permanent rename. Past records keep the name they were saved with.</p>
        <label className="field">
          Folder name
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
            autoFocus
          />
        </label>
        {folder.checklists.map((c) => (
          <label key={c.id} className="field">
            Checklist
            <input
              value={titles[c.id]}
              onChange={(event) => {
                setTitles({ ...titles, [c.id]: event.target.value })
                setError('')
              }}
            />
          </label>
        ))}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--accent">Save</button>
        </div>
      </form>
    </div>
  )
}

function SectionView({
  sectionId,
  sectionTitle,
  sectionIcon,
  state,
  onBack,
  actions,
  getUsageCount,
  getFolderRecords,
  getTotals,
}) {
  const [currentFolderId, setCurrentFolderId] = useState(null) // null = section root
  const [modal, setModal] = useState(null) // 'entry' | 'folder' | 'oneTime' | 'rename'

  const tree = useMemo(() => selectFolderTree(state, sectionId), [state, sectionId])

  // If the open folder disappeared (e.g. it was hidden from elsewhere), fall back to root.
  const node = currentFolderId ? tree.byId[currentFolderId] ?? null : null
  const folderId = node ? node.id : null

  const crumbs = [{ id: null, name: sectionTitle }]
  if (node) for (const id of node.path) crumbs.push({ id, name: tree.byId[id].name })
  const currentName = crumbs[crumbs.length - 1].name

  const childFolders = (node ? node.folders : tree.folders).filter((folder) => !folder.hidden)
  const checklists = node ? node.checklists : []
  const records = getFolderRecords ? getFolderRecords(folderId) : []
  const others = records.filter((r) => r.source === 'other')
  const items = records.filter((r) => r.source !== 'other')
  const savingGroups = node ? groupSavingAreaEntries(node.savingAreaEntries) : []
  const totals = getTotals ? getTotals(folderId) : null

  const closeModal = () => setModal(null)

  function confirmSubmit() {
    if (window.confirm('Submit hides this folder. Nothing is deleted — find it under 🙈 Hidden. Continue?')) {
      actions.setFolderHidden(node.id, true)
      setCurrentFolderId(node.parentFolderId)
    }
  }

  function confirmDuplicate() {
    if (window.confirm(`Do you want to add this folder “${currentName}” once again?`)) {
      actions.duplicateFolder(node.id)
    }
  }

  return (
    <main className={`section section--${sectionId}`}>
      <div className="section__toolbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Dashboard
        </button>
        <Breadcrumb
          crumbs={crumbs}
          onNavigate={(index) => setCurrentFolderId(index === 0 ? null : crumbs[index].id)}
        />
        <div className="section__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setModal('folder')}>
            + Folder
          </button>
          <button type="button" className="btn btn--accent" onClick={() => setModal('entry')}>
            + Entry
          </button>
        </div>
      </div>

      <div className="section__heading">
        <div>
          <h2 className="section__title">
            {sectionIcon} {currentName}
          </h2>
          {node && usageBadge(node) && <span className="section__usage">{usageBadge(node)}</span>}
          {node && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Edit folder and checklist names (permanent)"
                aria-label="Edit names"
                onClick={() => setModal('rename')}
              >
                ✏️
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Record a one-time amount for this folder"
                onClick={() => setModal('oneTime')}
              >
                + Edit
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Add this folder once again (duplicates its structure — not its recorded money)"
                onClick={confirmDuplicate}
              >
                ⧉ Add again
              </button>
            </>
          )}
        </div>
        {totals && <span className="section__total">{formatINR(totals.total)}</span>}
      </div>

      {node && (
        <ChecklistPanel
          rows={checklists}
          getUsageCount={getUsageCount}
          onRecord={(checklistId) => {
            const row = checklists.find((c) => c.id === checklistId)
            actions.recordChecklist({
              folderId: node.id,
              checklistId,
              amount: row.defaultAmount,
              source: 'checklist',
            })
          }}
          onRecordOther={(checklistId, amount) =>
            actions.recordChecklist({ folderId: node.id, checklistId, amount, source: 'checklist-other' })
          }
          onUpdateDefault={(checklistId, defaultAmount) => actions.updateChecklist(checklistId, { defaultAmount })}
          onDelete={(checklistId) => actions.deleteChecklist(checklistId)}
          onAdd={(title, defaultAmount) => actions.createChecklist({ folderId: node.id, title, defaultAmount })}
          onAddToSavingArea={(checklistId) =>
            actions.addSavingAreaEntry({ ownerFolderId: node.id, sourceType: 'checklist', sourceId: checklistId })
          }
        />
      )}

      {childFolders.length > 0 && (
        <div className="folders-grid">
          {childFolders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              summary={getTotals ? getTotals(folder.id) : undefined}
              canAddToSavingArea={node !== null}
              onOpen={() => setCurrentFolderId(folder.id)}
              onHide={() => actions.setFolderHidden(folder.id, true)}
              onAddToSavingArea={() =>
                actions.addSavingAreaEntry({ ownerFolderId: node.id, sourceType: 'folder', sourceId: folder.id })
              }
            />
          ))}
        </div>
      )}

      {node && (
        <div className="saving-area">
          <div className="checklist__head">
            <h3 className="checklist__title">🐖 Saving Area</h3>
          </div>
          {savingGroups.length === 0 ? (
            <p className="other-panel__empty">
              Nothing added yet. Use 🐖 on a checklist or “+ Add Items” on an inner folder.
            </p>
          ) : (
            savingGroups.map((group) => (
              <div key={group.key} className="saving-area__row">
                <span>
                  {group.sourceType === 'folder' ? '📁' : '📋'} {group.titleSnapshot}
                </span>
                <span className="saving-area__count">×{group.count}</span>
              </div>
            ))
          )}
        </div>
      )}

      {node && node.othersEnabled && (
        <OtherPanel
          others={others}
          onAdd={({ amount, details }) =>
            actions.recordOther({ folderId: node.id, amount, description: details || 'Other' })
          }
        />
      )}

      {node && node.usage === 'occasional' && (
        <div className="submit-bar">
          <button type="button" className="btn btn--accent submit-bar__btn" onClick={confirmSubmit}>
            ✅ Submit folder (hides after submit)
          </button>
          <p className="submit-bar__hint">
            Occasional folders never auto-submit. Submitting hides the folder; nothing is deleted.
          </p>
        </div>
      )}

      <div className="items-panel">
        {items.length === 0 ? (
          <div className="empty">
            No entries here yet — use “+ Entry”, a checklist’s ＋ button, or “+ Other”.
          </div>
        ) : (
          items.map((item) => <ItemRow key={item.id} item={item} />)
        )}
      </div>

      {modal === 'entry' && (
        <AddForm
          onCancel={closeModal}
          onConfirm={(payload) => {
            actions.addEntry({ folderId, ...payload })
            closeModal()
          }}
        />
      )}

      {modal === 'folder' && (
        <AddFolderForm
          onCancel={closeModal}
          onConfirm={(payload) => {
            actions.createFolder({ parentFolderId: folderId, ...payload })
            closeModal()
          }}
        />
      )}

      {modal === 'oneTime' && node && (
        <OneTimeDialog
          folderName={node.name}
          onCancel={closeModal}
          onConfirm={({ amount, description }) => {
            actions.recordFolderOneTime({ folderId: node.id, amount, description: description || node.name })
            closeModal()
          }}
        />
      )}

      {modal === 'rename' && node && (
        <RenameDialog
          folder={node}
          onCancel={closeModal}
          onSave={({ name, titles }) => {
            if (name !== node.name) actions.updateFolder(node.id, { name })
            for (const c of node.checklists) {
              if (titles[c.id].trim() !== c.title) actions.updateChecklist(c.id, { title: titles[c.id].trim() })
            }
            closeModal()
          }}
        />
      )}
    </main>
  )
}

export default SectionView
