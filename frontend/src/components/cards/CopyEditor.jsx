// The "+ Edit" copy editor. Pressing "+ Edit" on a folder INSIDE the copy opens that folder's copy
// as its own full-size editor (same width as the first one, never nested inside it), and the
// banner says how deep you are: "Level 2 · lunch folder › inner folder 1".
//   Back = throw this level's copy away and return to the level above.
//   Done = keep it and return to the level above (the first level's Done is handled by the page).
import { useState } from 'react'
import FolderCard from './FolderCard.jsx'
import { makeId } from '../../domain/folderChecklist.js'

export default function CopyEditor({ state, actions, onOpenSavingArea, rootCopyId, ownerId, trail = [], onRootDone, onRootBack }) {
  const [deeper, setDeeper] = useState([]) // [{ copyId, ownerId }] levels below the first
  const levels = [{ copyId: rootCopyId, ownerId }, ...deeper]
  const top = levels[levels.length - 1]
  const copy = state.folders.find((f) => f.id === top.copyId)
  if (!copy) return null
  const isRoot = deeper.length === 0
  const names = levels.map((l) => state.folders.find((f) => f.id === l.copyId)?.name ?? '…')

  function discard() {
    const entry = state.savingAreaEntries.find((e) => e.ownerFolderId === top.ownerId && e.sourceType === 'folder' && e.sourceId === copy.id)
    if (entry) actions.removeSavingAreaEntry(entry.id) // also removes the copy
  }

  return (
    <FolderCard key={top.copyId} state={state} folder={copy} depth={0} ownerId={top.ownerId} trail={trail}
      actions={actions} onOpenSavingArea={onOpenSavingArea} editingCopy
      levelTrail={names}
      onEditInner={(k) => {
        const id = makeId()
        actions.copyFolderToSavingArea({ folderId: k.id, ownerFolderId: copy.id, id })
        setDeeper((d) => [...d, { copyId: id, ownerId: copy.id }])
      }}
      onDone={() => {
        if (isRoot) { onRootDone(copy); return }
        actions.mergeIdenticalCopy(top.ownerId, copy.id)
        setDeeper((d) => d.slice(0, -1))
      }}
      onBack={() => {
        if (isRoot) { onRootBack(copy); return }
        discard()
        setDeeper((d) => d.slice(0, -1))
      }} />
  )
}
