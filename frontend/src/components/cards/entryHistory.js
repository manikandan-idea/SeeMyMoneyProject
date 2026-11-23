// Page-level history for a day / month / year / folder page (owner = its Saving Area owner).
// add()/remove() wrap the Saving Area actions and record them; logStruct() records the page's
// own checklist / folder creation + deletion. undo() / redo() replay them.
import { makeId, collectEntryTree } from '../../domain/folderChecklist.js'
import { pushUndo, setHist, useHist, revertStruct, reapplyStruct } from './historyStore.js'

export function useEntryHistory(ownerId, actions, state) {
  const key = `page:${ownerId}`
  const h = useHist(key)

  const add = (input) => {
    const id = makeId()
    actions.addSavingAreaEntry({ ownerFolderId: ownerId, ...input, id })
    pushUndo(key, { t: 'add', id, input })
  }
  const remove = (entry) => {
    const tree = collectEntryTree(state, entry) // the Saving Area copy that goes with it, for Undo
    actions.removeSavingAreaEntry(entry.id)
    pushUndo(key, { t: 'rem', entry, tree })
  }
  const logStruct = (action) => pushUndo(key, action)
  const updateDefault = (id, amount) => {
    const c = state.checklists.find((x) => x.id === id)
    actions.updateDefault(id, amount)
    if (c) pushUndo(key, { t: 'amt', id, from: c.defaultAmount, to: amount })
  }
  const updateEntries = (ids, amount) => {
    const from = state.savingAreaEntries.find((e) => ids.includes(e.id))?.amount
    actions.updateEntryAmount(ids, amount)
    if (from !== undefined) pushUndo(key, { t: 'eamt', ids, from, to: amount })
  }

  function undo() {
    const a = h.undo[h.undo.length - 1]
    if (!a) return
    let keep = a
    if (a.t === 'add') actions.removeSavingAreaEntry(a.id)
    else if (a.t === 'eamt') actions.updateEntryAmount(a.ids, a.from)
    else if (a.t === 'rem') actions.restoreSavingAreaEntry(a.entry, a.tree)
    else keep = revertStruct(a, state, actions)
    setHist(key, (x) => ({ undo: x.undo.slice(0, -1), redo: [...x.redo, keep] }))
  }
  function redo() {
    const a = h.redo[h.redo.length - 1]
    if (!a) return
    if (a.t === 'add') actions.addSavingAreaEntry({ ownerFolderId: ownerId, ...a.input, id: a.id })
    else if (a.t === 'eamt') actions.updateEntryAmount(a.ids, a.to)
    else if (a.t === 'rem') actions.removeSavingAreaEntry(a.entry.id)
    else reapplyStruct(a, actions)
    setHist(key, (x) => ({ undo: [...x.undo, a], redo: x.redo.slice(0, -1) }))
  }
  return { add, remove, logStruct, updateDefault, updateEntries, undo, redo, canUndo: h.undo.length > 0, canRedo: h.redo.length > 0 }
}
