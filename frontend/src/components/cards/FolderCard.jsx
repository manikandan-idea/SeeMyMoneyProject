// Folder card + checklist card, ported from card_records.html (see
// folder_creation_handoff.md). One recursive component: a folder card opens IN PLACE
// and shows its Checklists, its inner Folders (the same card, one level deeper,
// each depth with its own colour) and its Saving Area.
//
// Rules taken from card_records.html:
//   * Header: [Records] folder icon + name + dotted counts · Edit/Done · + Add item · 🗑 (inner folders)
//   * Records box is hidden on the outermost folder (depth 0), shown on inner folders
//   * Tap icon/name to open, Done to close
//   * On a CLOSED inner folder, + Edit makes a twin folder (same name) right below it,
//     already open so its edit options show
//   * + Add item = one more record only. Here that record is one Saving Area entry for
//     this folder (nothing is created inside it). Disabled while the folder is open.
//   * 🗑 with Records >= 2 removes ONE record (one such Saving Area entry). At Records = 1
//     the folder is HIDDEN (never destroyed; restore it from Hidden or with ←).
//   * ← / → under the stats undo / redo, in order: + Add item, a checklist or folder
//     being added, a checklist or folder being deleted. Checklist rows' own ← → undo
//     their records.
//   * New checklist: Amount first (required), name optional (auto "Checklist N"),
//     Type (Spend preselected), Advanced settings (Record count) - creates the reusable
//     blueprint only, no money.
//   * New folder: name optional (auto "Folder N"), Advanced settings (Record count).
//   * Stats: Spend / Received / Savings of this folder's OWN records.
//
// Props: state, folder, depth, ownerId, actions, trail, onOpenSavingArea(ownerId, title),
//        onTwin()  (inner folders only), onRemove()  (inner folders only: parent hides it),
//        initiallyOpen
// actions: createFolder, hideFolder, unhideFolder, addSavingAreaEntry, removeSavingAreaEntry,
//          createChecklist, updateDefault, deleteChecklist, deleteChecklistWithRecords,
//          restoreChecklist, recordOtherRow, removeRecord, restoreRecord, record

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatINR } from '../../utils/format.js'
import { calculateFolderView, folderRecordCount, folderItemEntries } from '../../domain/analytics.js'
import { useHist, setHist, revertStruct, reapplyStruct } from './historyStore.js'
import { useEntryHistory } from './entryHistory.js'
import QuickAdd from './QuickAdd.jsx'
import SavingFolderView from './SavingFolderView.jsx'
import { ShrinkButton, ShrinkCount, ShrinkList } from './ShrinkCard.jsx'
import { makeId, groupSavingAreaEntries } from '../../domain/folderChecklist.js'
import AdvancedSettings, { parseRecordCount } from './AdvancedSettings.jsx'
import ChecklistSection from './ChecklistSection.jsx'
import FolderPage from './FolderPage.jsx'
import Svg from './Svg.jsx'
import './cards.css'

const FOLDER_SVG = 'M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'
const TRASH_SVG = 'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3'

function nextName(base, names) {
  let n = names.length + 1
  while (names.includes(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function FolderCard({ state, folder, depth = 0, ownerId, actions, trail = [], onOpenSavingArea, onTwin, onRemove, initiallyOpen = false, onCopyEdit, editingCopy = false, levelTrail, onEditInner, onDone, onBack, onMenuDelete, tapView: tapViewProp, pageMode = false, onSheetDone }) {
  const [foldersShrunk, setFoldersShrunk] = useState(false) // Shrink / Expand button of the Folders card
  const [savingOnly, setSavingOnly] = useState(false) // "+ Edit" copy editor: slider = show only the Saving Area
  const [sheetOpen, setSheetOpen] = useState(false) // inner folder tapped in an edit view -> floating card
  const [pageOpen, setPageOpen] = useState(false) // tapped card -> this folder as its own full page
  const tapView = tapViewProp ?? Boolean(onCopyEdit || editingCopy) // period-page folders: tapping the card = use view
  const [menu, setMenu] = useState(false)
  const [open, setOpen] = useState(Boolean(initiallyOpen || editingCopy || pageMode))
  // Tapping the card (not +Edit) opens a USE view: checklists / folders to record from, no
  // "+ Add checklist" / "+ Add folder". +Edit (and twins / copies) open the full edit view.
  const [editMode, setEditMode] = useState(Boolean((initiallyOpen || editingCopy) && !pageMode))
  useEffect(() => {
    if (!pageOpen && !sheetOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setPageOpen(false); setSheetOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageOpen, sheetOpen])
  const [adding, setAdding] = useState(null) // 'f' | null (the checklist form lives in ChecklistSection)
  const [name, setName] = useState('')
  const [advOpen, setAdvOpen] = useState(false)
  const [rc, setRc] = useState('1')
  const [rcBad, setRcBad] = useState(false)
  const [flash, setFlash] = useState(false)
  // ← → of this card: only what happens INSIDE this folder (checklists / folders created or
  // deleted in it). Kept per folder, so it also sees changes made on the folder's own page.
  // On the day / folder pages (tapView) "+ Add item" belongs to the PAGE's history, not here.
  const histKey = `struct:${folder.id}`
  const hist = useHist(histKey)
  const undoStack = hist.undo
  const redoStack = hist.redo
  const setUndoStack = (fn) => setHist(histKey, (h) => ({ ...h, undo: typeof fn === 'function' ? fn(h.undo) : fn }))
  const setRedoStack = (fn) => setHist(histKey, (h) => ({ ...h, redo: typeof fn === 'function' ? fn(h.redo) : fn }))
  const pageHistory = useEntryHistory(ownerId, actions, state) // the PAGE this card sits on
  const folderHistory = useEntryHistory(folder.id, actions, state) // this folder's own page
  const [fresh, setFresh] = useState(() => new Set()) // twin folders: open on arrival

  const path = [...trail, folder.name]
  const lists = state.checklists.filter((c) => c.folderId === folder.id)
  const kids = state.folders.filter((f) => f.parentFolderId === folder.id && !f.hidden)
  const totals = calculateFolderView(state, folder.id)
  const own = state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id)
  // Records of this folder = 1 + "+ Add item" taps (entries of this folder in its parent's Saving Area)
  const itemEntries = folderItemEntries(state, folder, ownerId)
  // Records = starting count (Advanced settings, default 1) + "+ Add item" taps
  const records = folderRecordCount(state, folder, ownerId)
  const lastEntry = itemEntries[itemEntries.length - 1]
  const count = folder.recordCount ?? 1

  const autoFolder = nextName('Folder', kids.map((f) => f.name))

  // ---------- history (← →) ----------
  function log(action) {
    if (tapView) { folderHistory.logStruct(action); return } // arrows = this folder's page history
    setUndoStack((s) => [...s, action])
    setRedoStack([])
  }
  function titleOf(a) {
    if (a.t === 'rec') return 'item added'
    if (a.t === 'addC' || a.t === 'delC') {
      const row = a.snap?.row || state.checklists.find((c) => c.id === a.id)
      return `checklist “${row ? row.title : ''}” ${a.t === 'addC' ? 'added' : 'deleted'}`
    }
    const f = state.folders.find((x) => x.id === a.folderId)
    return `folder “${f ? f.name : ''}” ${a.t === 'addF' ? 'added' : 'deleted'}`
  }
  const addEntry = () => (tapView
    ? pageHistory.add({ sourceType: 'folder', sourceId: folder.id })
    : actions.addSavingAreaEntry({ ownerFolderId: ownerId, sourceType: 'folder', sourceId: folder.id }))

  // Reverses one action; returns the action to keep for Redo (with a snapshot when needed).
  function revert(a) {
    if (a.t === 'rec') { if (lastEntry) actions.removeSavingAreaEntry(lastEntry.id); return a }
    return revertStruct(a, state, actions)
  }
  // Applies the action again (Redo).
  function reapply(a) {
    if (a.t === 'rec') addEntry()
    else reapplyStruct(a, actions)
  }
  function onUndo() {
    if (undoStack.length) {
      const back = revert(undoStack[undoStack.length - 1])
      setUndoStack((s) => s.slice(0, -1))
      setRedoStack((r) => [...r, back])
    } else if (lastEntry && !tapView) {
      // after a reload the history is empty, but earlier "+ Add item" records still exist
      actions.removeSavingAreaEntry(lastEntry.id)
      setRedoStack((r) => [...r, { t: 'rec' }])
    }
  }
  function onRedo() {
    if (!redoStack.length) return
    const a = redoStack[redoStack.length - 1]
    reapply(a)
    setRedoStack((r) => r.slice(0, -1))
    setUndoStack((s) => [...s, a])
  }
  const canUndo = undoStack.length > 0 || (Boolean(lastEntry) && !tapView)
  const lastUndo = undoStack[undoStack.length - 1]
  const nextRedo = redoStack[redoStack.length - 1]

  // ---------- forms ----------
  function openForm(kind) { setAdding(kind); setName(''); setAdvOpen(false); setRc('1'); setRcBad(false) }
  function closeForm() { setAdding(null) }

  function createFolder(e) {
    e.preventDefault()
    const countN = parseRecordCount(rc)
    if (countN === null) { setAdvOpen(true); setRcBad(true); return }
    const id = makeId()
    actions.createFolder({
      id,
      sectionId: folder.sectionId,
      parentFolderId: folder.id,
      name: name.trim() || autoFolder,
      usage: folder.usage,
      frequency: folder.frequency,
      recordCount: countN,
    })
    log({ t: 'addF', folderId: id })
    closeForm()
  }

  // "+ Edit" on a closed inner folder: same name, new folder directly below, already open.
  function twinOf(k) {
    const id = makeId()
    actions.createFolder({
      id, afterFolderId: k.id, sectionId: k.sectionId, parentFolderId: folder.id,
      name: k.name, usage: k.usage, frequency: k.frequency,
    })
    setFresh((s) => new Set(s).add(id))
    log({ t: 'addF', folderId: id })
  }
  // Trash on an inner folder with 1 record: hide it (restore with ← or from Hidden).
  function removeKid(k) {
    actions.hideFolder(k.id)
    log({ t: 'delF', folderId: k.id })
  }

  function onEdit() {
    // Page folder: "+ Edit" makes a copy that lives in the Saving Area; this folder stays as it is.
    if (editingCopy) { onDone?.(); return }
    if (depth === 0 && onCopyEdit && !open) { onCopyEdit(); return }
    if (depth > 0 && onTwin && !open) { onTwin(); return }
    setEditMode(true)
    setOpen((v) => !v)
    if (open) closeForm()
  }
  function onAddItem() {
    addEntry()
    if (!tapView) log({ t: 'rec' })
    setFlash(true)
    setTimeout(() => setFlash(false), 800)
  }
  function onDelete() {
    if (itemEntries.length > 0) {
      // removes ONE record: the latest "+ Add item" entry (and its history line, if any)
      actions.removeSavingAreaEntry(lastEntry.id)
      setUndoStack((s) => {
        const i = s.map((a) => a.t).lastIndexOf('rec')
        return i === -1 ? s : [...s.slice(0, i), ...s.slice(i + 1)]
      })
      setRedoStack([])
    } else if (onRemove) {
      onRemove()
    }
  }

  // Quick add records live in a Saving Area COPY's own Saving Area: shown under that copy's
  // Checklists. The original folder's Checklists container never shows them.
  const quickGroups = folder.savingCopy
    ? groupSavingAreaEntries(state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id && e.quick))
    : []
  const cls = `fc fc--d${depth % 3}${depth > 0 ? ' fc--inner' : ''}${editingCopy ? ' fc--copy' : ''}${onCopyEdit ? ' fc--page' : ''}`
  const delTitle = itemEntries.length > 0 ? 'Remove one record' : 'Hide this folder'
  // Banner of the "+ Edit" copy editor: Back, depth text, Quick add (fixed on the right) and the
  // Saving Area slider (ON = show only what is in this copy's Saving Area).
  const copyBanner = editingCopy && (
    <div className="fc__copynote">
      <div className="fc__copynote-top">
        <div className="fc__copynote-main">
          {onBack && <button type="button" className="fc__back" onClick={onBack} title="Discard this copy and go back, nothing changes">← Back</button>}
          <span className="fc__copynote-text">
            {levelTrail && levelTrail.length > 1
              ? <><b className="fc__level">Level {levelTrail.length}</b> · {levelTrail.join(' › ')}</>
              : 'Editing a copy · saved in the Saving Area, the original is unchanged'}
          </span>
        </div>
        <QuickAdd state={state} ownerId={folder.id} history={folderHistory} where={`${folder.name} copy’s Saving Area`} />
      </div>
      <label className="fc__switch" title="ON: show only the checklists and folders that are in this copy's Saving Area">
        <input type="checkbox" role="switch" checked={savingOnly} onChange={(e) => setSavingOnly(e.target.checked)} />
        <span className="fc__switch-track" aria-hidden="true"><span className="fc__switch-knob" /></span>
        <span className="fc__switch-label">Saving Area only</span>
      </label>
    </div>
  )

  if (editingCopy && savingOnly) {
    return (
      <div className={cls}>
        {copyBanner}
        <div className="fc__savingwrap">
          <SavingFolderView state={state} ownerId={folder.id} title={folder.name} onClose={onDone ?? (() => setSavingOnly(false))}
            history={folderHistory} actions={actions}
            onUpdateDefault={folderHistory.updateDefault} onUpdateEntries={folderHistory.updateEntries} />
        </div>
      </div>
    )
  }

  return (
    <div className={cls}>
      {copyBanner}
      <div className="fc__row">
        {depth > 0 && (
          <div className="fc__count" role="status" aria-label={`Records: ${records}`}>
            <b>{records}</b><span>Records</span>
          </div>
        )}
        <button type="button" className="fc__head" aria-label={`Open folder ${folder.name}`} onClick={() => {
          if (pageMode) return
          if (tapView) { if (depth > 0) setSheetOpen(true); else setPageOpen(true); return }
          if (!open) { setEditMode(true); setOpen(true) }
        }}>
          <span className="fc__tile"><Svg d={FOLDER_SVG} size={20} /></span>
          <span className="fc__who">
            <div className="fc__name" title={path.join(' - ') + (count > 1 ? ` · Record count ${count}` : '')}>{folder.name}</div>
            <div className="fc__sub">
              <span><i className="fc__dot" />{lists.length} {lists.length === 1 ? 'checklist' : 'checklists'}</span>
              <span><i className="fc__dot" />{kids.length} {kids.length === 1 ? 'folder' : 'folders'}</span>
            </div>
          </span>
        </button>
        {pageMode && onSheetDone && <button type="button" className="fc__edit fc__edit--on" onClick={onSheetDone}>✓ Done</button>}
        {!pageMode && <button type="button" className={`fc__edit${open ? ' fc__edit--on' : ''}`} aria-expanded={open}
          title={open ? (editingCopy ? 'Finish editing the copy' : 'Close folder') : (depth > 0 && onTwin) || (depth === 0 && onCopyEdit) ? 'Edit a copy of this folder in the Saving Area' : 'Open folder'}
          onClick={onEdit}>
          {open ? '✓ Done' : '+ Edit'}
        </button>}
        {!pageMode && <button type="button" className="fc__add" disabled={open || editingCopy} onClick={onAddItem}>
          {flash ? '✓ Added' : '+ Add item'}
        </button>}
        {onMenuDelete && (
          <div className="cr__menuwrap">
            <button type="button" className="cr__more" aria-label="More options" aria-haspopup="menu" aria-expanded={menu}
              onClick={() => setMenu((v) => !v)} onBlur={() => setTimeout(() => setMenu(false), 150)}>
              <Svg d="M12 5.5v.01M12 12v.01M12 18.5v.01" size={20} />
            </button>
            {menu && (
              <div className="cr__menu" role="menu">
                <button type="button" role="menuitem" className="cr__menuitem cr__menuitem--danger"
                  onClick={() => { setMenu(false); onMenuDelete() }}>Delete folder</button>
              </div>
            )}
          </div>
        )}
        {depth > 0 && !pageMode && (
          <button type="button" className="fc__del" aria-label={delTitle} title={delTitle} onClick={onDelete}>
            <Svg d={TRASH_SVG} />
          </button>
        )}
      </div>

      {open && (
        <div className="fc__inside">
          <ChecklistSection lists={lists} state={state} trail={path} actions={actions} onHistory={log} hideAdd={!editMode}
            quickGroups={quickGroups}
            onQuickRepeat={(g) => folderHistory.add({ sourceType: 'checklist', sourceId: g.sourceId, cloneOf: g.entries[g.entries.length - 1].id })}
            onQuickRemove={(g) => folderHistory.remove(g.entries[g.entries.length - 1])}
            onQuickRestore={(entry) => actions.restoreSavingAreaEntry(entry)}
            onQuickEditAmount={(g, n) => folderHistory.updateEntries(g.entries.map((e) => e.id), n)}
            onQuickOther={(g, n) => folderHistory.quickAdd({ name: g.titleSnapshot, amount: n, transactionType: g.entries[0].transactionType, records: 1 })}
            onCreate={(p) => actions.createChecklist({ folderId: folder.id, sectionId: folder.sectionId, ...p })} />

          <div className="fc__sec">
            <div className="fc__sechead">
              <span className="fc__sectitle">Folders<ShrinkCount n={kids.length} /></span>
              <ShrinkButton shrunk={foldersShrunk} count={kids.length} onToggle={() => setFoldersShrunk((v) => !v)} />
              {editMode && <button type="button" className="fc__ibtn" onClick={() => openForm('f')}>+ Add folder</button>}
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
                <AdvancedSettings open={advOpen} onToggle={() => setAdvOpen((v) => !v)} value={rc} bad={rcBad}
                  onChange={(v) => { setRc(v); setRcBad(false) }} />
                <button type="submit" className="fc__create">Create Folder</button>
              </form>
            )}
            <ShrinkList className="fc__list" shrunk={foldersShrunk} maxHeight={150}>
              {kids.length === 0 && <div className="fc__empty">No folders yet</div>}
              {kids.map((k) => (
                <FolderCard key={k.id} state={state} folder={k} depth={depth + 1} ownerId={folder.id}
                  trail={path} actions={actions} onOpenSavingArea={onOpenSavingArea} tapView={tapView}
                  initiallyOpen={fresh.has(k.id)}
                  onTwin={() => (editingCopy && onEditInner ? onEditInner(k) : twinOf(k))}
                  onRemove={() => removeKid(k)} />
              ))}
            </ShrinkList>
          </div>

        </div>
      )}

      <div className="fc__statrow">
        <div className="fc__stats">
          <div className="fc__stat fc__stat--s"><span>Spend</span><b>{formatINR(totals.expense)}</b></div>
          <div className="fc__stat fc__stat--r"><span>Received</span><b>{formatINR(totals.income)}</b></div>
          <div className="fc__stat fc__stat--v"><span>Savings</span><b>{formatINR(totals.saving)}</b></div>
        </div>
        <button type="button" className="fc__arrow" aria-label="Undo" disabled={tapView ? !folderHistory.canUndo : !canUndo}
          onClick={tapView ? folderHistory.undo : onUndo}
          title={tapView ? 'Undo (everything done on this folder\'s page)' : lastUndo ? `Undo: ${titleOf(lastUndo)}` : lastEntry ? 'Undo: item added' : 'Nothing to undo'}>
          <Svg d="M5 12h14M5 12l6 6M5 12l6-6" size={15} />
        </button>
        <button type="button" className="fc__arrow" aria-label="Redo" disabled={tapView ? !folderHistory.canRedo : !nextRedo}
          onClick={tapView ? folderHistory.redo : onRedo}
          title={tapView ? 'Redo (everything done on this folder\'s page)' : nextRedo ? `Redo: ${titleOf(nextRedo)}` : 'Nothing to redo'}>
          <Svg d="M5 12h14M13 18l6-6M13 6l6 6" size={15} />
        </button>
      </div>

      {sheetOpen && createPortal(
        <div className="fsheet" role="dialog" aria-modal="true" aria-label={`Folder ${folder.name}`}>
          <div className="fsheet__card">
            <FolderCard state={state} folder={folder} depth={0} ownerId={ownerId} actions={actions}
              trail={trail} onOpenSavingArea={onOpenSavingArea} tapView pageMode
              onSheetDone={() => setSheetOpen(false)} />
          </div>
        </div>,
        document.body,
      )}

      {pageOpen && createPortal(
        <div className="fp" role="dialog" aria-modal="true" aria-label={`Folder ${folder.name}`}>
          <div className="fp__panel">
            <FolderPage state={state} folder={folder} actions={actions} onOpenSavingArea={onOpenSavingArea}
              onBack={() => setPageOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export default FolderCard
