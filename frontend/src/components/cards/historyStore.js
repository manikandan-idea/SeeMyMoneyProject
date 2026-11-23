// Undo / redo stacks that survive re-mounts, kept per scope key:
//   `struct:<folderId>`   checklists / folders created or deleted INSIDE that folder
//                         (the folder card's ← →; nothing outside the card is touched)
//   `page:<ownerId>`      page-level actions of a day / month / year / folder page:
//                         Saving Area entries added or removed, plus the page's own
//                         checklists and folders (the page's ← → on its bottom card)
import { useSyncExternalStore } from 'react'

const EMPTY = { undo: [], redo: [] }
const stores = new Map()
const listeners = new Set()

export function getHist(key) { return stores.get(key) ?? EMPTY }
export function setHist(key, fn) {
  stores.set(key, fn(getHist(key)))
  listeners.forEach((l) => l())
}
export function useHist(key) {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => getHist(key),
  )
}
export const pushUndo = (key, action) => setHist(key, (h) => ({ undo: [...h.undo, action], redo: [] }))

// ---- structural actions (checklist / folder created or deleted) ----
// a = { t: 'amt', id, from, to } (default amount edited)
//   | { t: 'addC', id, withRecords? } | { t: 'delC', snap } | { t: 'addF', folderId } | { t: 'delF', folderId }
// Reverses one; returns the action to keep for Redo (with a snapshot when needed).
export function revertStruct(a, state, actions) {
  if (a.t === 'amt') { actions.updateDefault(a.id, a.from); return a }
  if (a.t === 'addC') {
    const index = state.checklists.findIndex((c) => c.id === a.id)
    if (index === -1) return a
    const row = state.checklists[index]
    const txs = a.withRecords ? state.transactions.filter((t) => t.checklistId === a.id) : []
    if (a.withRecords) actions.deleteChecklistWithRecords(a.id)
    else actions.deleteChecklist(a.id)
    return { ...a, snap: { row, index, txs } }
  }
  if (a.t === 'delC') { actions.restoreChecklist(a.snap); return a }
  if (a.t === 'addF') { actions.hideFolder(a.folderId); return a }
  actions.unhideFolder(a.folderId) // 'delF'
  return a
}
export function reapplyStruct(a, actions) {
  if (a.t === 'amt') { actions.updateDefault(a.id, a.to); return }
  if (a.t === 'addC') { if (a.snap) actions.restoreChecklist(a.snap) }
  else if (a.t === 'delC') actions.deleteChecklist(a.snap.row.id)
  else if (a.t === 'addF') actions.unhideFolder(a.folderId)
  else actions.hideFolder(a.folderId) // 'delF'
}
