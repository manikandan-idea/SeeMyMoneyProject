// The folder-explorer page for one section (Income / Expense / Saving).
// Inside a folder you get: regular checklist, sub-folders, "Other" row,
// the manual Submit button (occasional folders), and the entry list.

import { useState } from 'react'
import Breadcrumb from './Breadcrumb.jsx'
import FolderCard from './FolderCard.jsx'
import ItemRow from './ItemRow.jsx'
import AddForm from './AddForm.jsx'
import AddFolderForm from './AddFolderForm.jsx'
import ChecklistPanel from './ChecklistPanel.jsx'
import OtherPanel from './OtherPanel.jsx'
import { getNode, totalOf, directTotalOf } from '../data/sampleData.js'
import { formatINR } from '../utils/format.js'

function usageBadge(node) {
  if (!node.usage) return null
  if (node.usage === 'daily') return '🔁 Daily — auto-submits every day'
  if (node.usage === 'monthly') return '🗓 Monthly — auto-submits every month'
  if (node.usage === 'yearly') return '📆 Yearly — auto-submits every year'
  if (node.frequency === 'once') return '⚡ Occasional · one-time'
  return '🔁 Occasional · multi-use'
}

function SectionView({ sectionId, sectionTitle, sectionIcon, root, onBack, actions }) {
  const [path, setPath] = useState([])
  const [modal, setModal] = useState(null) // 'entry' | 'folder'

  const node = getNode(root, path)

  // Build the breadcrumb from the path
  const crumbs = [{ id: null, name: sectionTitle }]
  let walker = root
  for (const folderId of path) {
    walker = walker.folders.find((folder) => folder.id === folderId)
    crumbs.push({ id: folderId, name: walker.name })
  }
  const currentName = crumbs[crumbs.length - 1].name

  function confirmSubmit() {
    const after =
      node.frequency === 'once'
        ? 'this folder will be DELETED'
        : 'this folder will move to Hidden folders'
    if (window.confirm(`Submit saves all recorded entries, then ${after}. Continue?`)) {
      actions.submitFolder(node.id)
      setPath(path.slice(0, -1)) // step out of the submitted folder
    }
  }

  // "Add again": ask Yes/No, then duplicate this folder's structure
  function confirmDuplicate() {
    if (window.confirm(`Do you want to add this folder "${currentName}" once again?`)) {
      actions.duplicateFolder(node.id)
    }
  }

  const visibleFolders = node.folders.filter((folder) => !folder.hidden)

  return (
    <main className={`section section--${sectionId}`}>
      <div className="section__toolbar">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Dashboard
        </button>
        <Breadcrumb crumbs={crumbs} onNavigate={(index) => setPath(path.slice(0, index))} />
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
          {usageBadge(node) && <span className="section__usage">{usageBadge(node)}</span>}
          {path.length > 0 && (
            <button
              type="button"
              className="icon-btn"
              title="Add this folder once again (duplicates its structure — not its recorded money)"
              onClick={confirmDuplicate}
            >
              ⧉ Add again
            </button>
          )}
        </div>
        <span
          className="section__total"
          title={
            path.length > 0
              ? 'Money directly in this folder — subfolders are counted on their own cards'
              : 'Total money in this whole section'
          }
        >
          {formatINR(path.length > 0 ? directTotalOf(node) : totalOf(node))}
        </span>
      </div>

      {node.checklist && node.checklist.length > 0 && (
        <ChecklistPanel
          rows={node.checklist}
          onRecord={(rowId, amount) => actions.recordChecklistRow(path, rowId, amount)}
          onSaveRowAmount={(rowId, amount) => actions.updateChecklistRow(path, rowId, amount)}
          onDeleteRow={(rowId) => actions.deleteChecklistRow(path, rowId)}
          onAddRow={(title, amount) => actions.addChecklistRow(path, title, amount)}
        />
      )}

      {visibleFolders.length > 0 && (
        <div className="folders-grid">
          {visibleFolders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onOpen={() => setPath([...path, folder.id])}
              onHide={() => actions.toggleHideFolder(path, folder.id)}
            />
          ))}
        </div>
      )}

      {node.othersEnabled && (
        <OtherPanel others={node.others} onAdd={(payload) => actions.addOther(path, payload)} />
      )}

      {node.usage === 'occasional' && (
        <div className="submit-bar">
          <button type="button" className="btn btn--accent submit-bar__btn" onClick={confirmSubmit}>
            ✅ Submit folder{' '}
            {node.frequency === 'once' ? '(deletes after submit)' : '(hides after submit)'}
          </button>
          <p className="submit-bar__hint">
            Occasional folders never auto-submit — pressing Submit saves the recorded entries to this
            section’s permanent list.
          </p>
        </div>
      )}

      <div className="items-panel">
        {node.items.length === 0 ? (
          <div className="empty">
            No entries here yet — use “+ Entry”, the ＋ icon on checklist rows, or “+ Other”.
          </div>
        ) : (
          node.items.map((item) => <ItemRow key={item.id} item={item} />)
        )}
      </div>

      {modal === 'entry' && (
        <AddForm
          onCancel={() => setModal(null)}
          onConfirm={(payload) => {
            actions.addItem(path, payload)
            setModal(null)
          }}
        />
      )}

      {modal === 'folder' && (
        <AddFolderForm
          onCancel={() => setModal(null)}
          onConfirm={(payload) => {
            actions.addFolder(path, payload)
            setModal(null)
          }}
        />
      )}
    </main>
  )
}

export default SectionView
