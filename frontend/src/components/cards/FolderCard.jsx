// Folder card + checklist card, ported from card_records.html (see
// folder_creation_handoff.md). One recursive component: a folder card opens IN PLACE
// and shows its Checklists, its inner Folders (the same card, one level deeper,
// each depth with its own colour) and its Saving Area.
//
// Rules taken from the handoff:
//   * Header: [Records] folder icon + name + counts · Edit/Done · + Add item · 🗑
//   * Records box is hidden on the outermost folder (depth 0), shown on inner folders
//   * Tap icon/name to open, Done to close
//   * On a CLOSED inner folder, + Edit makes a twin folder (same name) right below it
//   * + Add item = one more record only. Here that record is one Saving Area entry for
//     this folder (nothing is created inside it). Disabled while the folder is open.
//   * 🗑 with Records >= 2 removes ONE record (one such Saving Area entry). At Records = 1
//     the folder is HIDDEN (never destroyed; restore it from Hidden).
//   * New checklist: Amount first (required), name optional (auto "Checklist N"),
//     Type (Spend preselected) - creates the reusable blueprint only, no money.
//   * New folder: name optional (auto "Folder N") - nothing else.
//   * Stats: Spend / Received / Savings of this folder's OWN records.
//
// Props: state, folder, depth, ownerId, actions, trail, onOpenSavingArea(ownerId, title),
//        onTwin()  (inner folders only)
// actions: createFolder, hideFolder, addSavingAreaEntry, removeSavingAreaEntry,
//          createChecklist, updateDefault, deleteChecklist, record

import { useState } from 'react'
import { formatINR } from '../../utils/format.js'
import { calculateFolderTotals } from '../../domain/analytics.js'
import SavingArea from '../SavingArea.jsx'
import ChecklistSection from './ChecklistSection.jsx'
import Svg from './Svg.jsx'
import './cards.css'

const FOLDER_SVG = 'M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
const TRASH_SVG = 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3'

function nextName(base, names) {
  let n = names.length + 1
  while (names.includes(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function FolderCard({ state, folder, depth = 0, ownerId, actions, trail = [], onOpenSavingArea, onTwin }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(null) // 'c' | 'f' | null
  const [name, setName] = useState('')
  const [flash, setFlash] = useState(false)
  const [undone, setUndone] = useState(0) // how many "+ Add item" taps were undone (available to redo)

  const path = [...trail, folder.name]
  const lists = state.checklists.filter((c) => c.folderId === folder.id)
  const kids = state.folders.filter((f) => f.parentFolderId === folder.id && !f.hidden)
  const totals = calculateFolderTotals(state, folder.id)
  const own = state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id)
  // Records of this folder = 1 + "+ Add item" taps (entries of this folder in its parent's Saving Area)
  const itemEntries = state.savingAreaEntries.filter(
    (e) => e.ownerFolderId === ownerId && e.sourceType === 'folder' && e.sourceId === folder.id,
  )
  const records = 1 + itemEntries.length

  const autoFolder = nextName('Folder', kids.map((f) => f.name))

  function openForm(kind) { setAdding(kind); setName('') }
  function closeForm() { setAdding(null) }

  function createFolder(e) {
    e.preventDefault()
    actions.createFolder({
      sectionId: folder.sectionId,
      parentFolderId: folder.id,
      name: name.trim() || autoFolder,
      usage: folder.usage,
      frequency: folder.frequency,
    })
    closeForm()
  }

  function onEdit() {
    if (depth > 0 && onTwin && !open) { onTwin(); return }
    setOpen((v) => !v)
    if (open) closeForm()
  }
  function onAddItem() {
    actions.addSavingAreaEntry({ ownerFolderId: ownerId, sourceType: 'folder', sourceId: folder.id })
    setUndone(0)
    setFlash(true)
    setTimeout(() => setFlash(false), 800)
  }
  function onUndo() {
    if (!itemEntries.length) return
    actions.removeSavingAreaEntry(itemEntries[itemEntries.length - 1].id)
    setUndone((n) => n + 1)
  }
  function onRedo() {
    if (!undone) return
    actions.addSavingAreaEntry({ ownerFolderId: ownerId, sourceType: 'folder', sourceId: folder.id })
    setUndone((n) => n - 1)
  }
  function onDelete() {
    if (records > 1) actions.removeSavingAreaEntry(itemEntries[itemEntries.length - 1].id)
    else if (window.confirm(`Hide the folder “${folder.name}”? Nothing is deleted. You can restore it from Hidden.`)) {
      actions.hideFolder(folder.id)
    }
  }

  const cls = `fc fc--d${depth % 3}${depth > 0 ? ' fc--inner' : ''}`
  return (
    <div className={cls}>
      <div className="fc__row">
        {depth > 0 && (
          <div className="fc__count" role="status" aria-label={`Records: ${records}`}>
            <b>{records}</b><span>Records</span>
          </div>
        )}
        <button type="button" className="fc__head" aria-label={`Open folder ${folder.name}`} onClick={() => setOpen(true)}>
          <span className="fc__tile"><Svg d={FOLDER_SVG} size={20} /></span>
          <span className="fc__who">
            <div className="fc__name" title={path.join(' - ')}>{folder.name}</div>
            <div className="fc__sub">
              <span><i className="fc__dot" />{lists.length} {lists.length === 1 ? 'checklist' : 'checklists'}</span>
              <span><i className="fc__dot" />{kids.length} {kids.length === 1 ? 'folder' : 'folders'}</span>
            </div>
          </span>
        </button>
        <button type="button" className={`fc__edit${open ? ' fc__edit--on' : ''}`} aria-expanded={open}
          title={open ? 'Close folder' : depth > 0 && onTwin ? 'Create a copy of this folder to edit' : 'Open folder'}
          onClick={onEdit}>
          {open ? '✓ Done' : '+ Edit'}
        </button>
        <button type="button" className="fc__add" disabled={open} onClick={onAddItem}>
          {flash ? '✓ Added' : '+ Add item'}
        </button>
        {depth > 0 && (
          <button type="button" className="fc__del" aria-label={records > 1 ? 'Remove one record' : 'Hide this folder'}
            title={records > 1 ? 'Remove one record' : 'Hide this folder'} onClick={onDelete}>
            <Svg d={TRASH_SVG} />
          </button>
        )}
      </div>

      {open && (
        <div className="fc__inside">
          <ChecklistSection lists={lists} state={state} trail={path} actions={actions}
            onCreate={(p) => actions.createChecklist({ folderId: folder.id, sectionId: folder.sectionId, ...p })} />

          <div className="fc__sec">
            <div className="fc__sechead">
              <span className="fc__sectitle">Folders</span>
              <button type="button" className="fc__ibtn" onClick={() => openForm('f')}>+ Add folder</button>
            </div>
            {adding === 'f' && (
              <form className="fc__form" onSubmit={createFolder} aria-label="New folder">
                <div>
                  <div className="fc__lbl"><span>Folder name <i>(optional)</i></span>
                    <button type="button" className="fc__x" aria-label="Cancel" onClick={closeForm}><Svg d="M18 6L6 18M6 6l12 12" /></button>
                  </div>
                  <input className="fc__in" maxLength={30} autoFocus placeholder={`Auto: ${autoFolder}`} value={name}
                    onChange={(e) => setName(e.target.value)} aria-label="Folder name (optional)" />
                </div>
                <button type="submit" className="fc__create">Create Folder</button>
              </form>
            )}
            <div className="fc__list">
              {kids.length === 0 && <div className="fc__empty">No folders yet</div>}
              {kids.map((k) => (
                <FolderCard key={k.id} state={state} folder={k} depth={depth + 1} ownerId={folder.id}
                  trail={path} actions={actions} onOpenSavingArea={onOpenSavingArea}
                  onTwin={() => actions.createFolder({
                    sectionId: k.sectionId, parentFolderId: folder.id, name: k.name, usage: k.usage, frequency: k.frequency,
                  })} />
              ))}
            </div>
          </div>

          <SavingArea
            entries={own}
            choices={{ checklists: lists, folders: kids }}
            onOpen={onOpenSavingArea ? () => onOpenSavingArea(folder.id, folder.name) : undefined}
            onAdd={({ sourceType, sourceId }) =>
              actions.addSavingAreaEntry({ ownerFolderId: folder.id, sourceType, sourceId })}
          />
        </div>
      )}

      <div className="fc__statrow">
        <div className="fc__stats">
          <div className="fc__stat fc__stat--s"><span>Spend</span><b>{formatINR(totals.expense)}</b></div>
          <div className="fc__stat fc__stat--r"><span>Received</span><b>{formatINR(totals.income)}</b></div>
          <div className="fc__stat fc__stat--v"><span>Savings</span><b>{formatINR(totals.saving)}</b></div>
        </div>
        <button type="button" className="fc__arrow" aria-label="Undo" disabled={!itemEntries.length} onClick={onUndo}
          title={itemEntries.length ? 'Undo last + Add item' : 'Nothing to undo'}>
          <Svg d="M5 12h14M5 12l6 6M5 12l6-6" size={15} />
        </button>
        <button type="button" className="fc__arrow" aria-label="Redo" disabled={!undone} onClick={onRedo}
          title={undone ? 'Redo + Add item' : 'Nothing to redo'}>
          <Svg d="M5 12h14M13 18l6-6M13 6l6 6" size={15} />
        </button>
      </div>
    </div>
  )
}

export default FolderCard
