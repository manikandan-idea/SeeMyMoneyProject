// Run with: node --test src/domain/analytics.value.test.js
// Folder / page value: the numbers on a folder card, its page and its "+ Edit" copy.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFolder, createChecklistTemplate, updateChecklistTemplate, updateFolder, setFolderHidden,
  deleteChecklistTemplate, addSavingAreaEntry, copyFolderToSavingArea, removeSavingAreaEntry,
} from './folderChecklist.js'
import { calculateOwnerValue } from './analytics.js'

const empty = () => ({
  schemaVersion: 1,
  sections: [{ id: 'income', title: 'Income' }, { id: 'expense', title: 'Expense' }, { id: 'saving', title: 'Saving' }],
  folders: [], checklists: [], transactions: [], savingAreaEntries: [],
})
const last = (a) => a[a.length - 1]
const val = (s, id) => calculateOwnerValue(s, id)
const spend = (s, id) => val(s, id).expense

function folder(s, name, parentFolderId = null, extra = {}) {
  const t = createFolder(s, { sectionId: 'expense', parentFolderId, name, usage: 'daily', othersEnabled: false, ...extra })
  return [t, last(t.folders)]
}
function checklist(s, folderId, title, defaultAmount, extra = {}) {
  const t = createChecklistTemplate(s, { folderId, title, defaultAmount, transactionType: 'expense', ...extra })
  return [t, last(t.checklists)]
}
const tx = (s, c, amount) => ({
  ...s, transactions: [...s.transactions, { id: `tx${s.transactions.length}`, checklistId: c.id, folderId: c.folderId, amount }],
})
const dropTx = (s, id) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== id) })

test('a checklist counts Records x amount: starting records plus every recorded "+"', () => {
  let [s, F] = folder(empty(), 'F')
  let c; [s, c] = checklist(s, F.id, 'Lunch', 500, { baseRecord: 2 })
  assert.equal(spend(s, F.id), 1000)          // Records 2 x 500
  s = tx(s, c, 500)
  assert.equal(spend(s, F.id), 1500)          // "+" -> Records 3
  s = dropTx(s, 'tx0')
  assert.equal(spend(s, F.id), 1000)          // trash removes one record
  s = updateChecklistTemplate(s, c.id, { baseRecord: 1 })
  assert.equal(spend(s, F.id), 500)           // starting records go down one by one
  s = deleteChecklistTemplate(s, c.id)
  assert.equal(spend(s, F.id), 0)             // deleted checklist counts nothing
})

test('each checklist counts under its own type', () => {
  let [s, F] = folder(empty(), 'F')
  ;[s] = checklist(s, F.id, 'Pay', 100, { baseRecord: 1, transactionType: 'income' })
  ;[s] = checklist(s, F.id, 'Tea', 20, { baseRecord: 3 })
  ;[s] = checklist(s, F.id, 'Gold', 7, { baseRecord: 1, transactionType: 'saving' })
  assert.deepEqual(val(s, F.id), { income: 100, expense: 60, saving: 7 })
})

test('"Other" row: no starting record, its recorded amount is the value', () => {
  let [s, F] = folder(empty(), 'F')
  let o; [s, o] = checklist(s, F.id, 'Lunch', 55) // no baseRecord, like recordOtherRow
  assert.equal(spend(s, F.id), 0)
  s = tx(s, o, 55)
  assert.equal(spend(s, F.id), 55)
})

test('editing the default amount: starting records follow it, recorded transactions keep their amount', () => {
  let [s, F] = folder(empty(), 'F')
  let c; [s, c] = checklist(s, F.id, 'Lunch', 100, { baseRecord: 2 })
  s = tx(s, c, 100)
  s = updateChecklistTemplate(s, c.id, { defaultAmount: 150 })
  assert.equal(spend(s, F.id), 2 * 150 + 100)
})

test('inner folders roll up into every folder above, times their Record count', () => {
  let [s, F] = folder(empty(), 'F')
  let G, H, c
  ;[s, c] = checklist(s, F.id, 'F-list', 1000, { baseRecord: 1 })
  ;[s, G] = folder(s, 'G', F.id)
  ;[s] = checklist(s, G.id, 'G-list', 100, { baseRecord: 1 })
  ;[s, H] = folder(s, 'H', G.id)
  ;[s] = checklist(s, H.id, 'H-list', 10, { baseRecord: 1 })
  assert.equal(spend(s, H.id), 10)
  assert.equal(spend(s, G.id), 110)
  assert.equal(spend(s, F.id), 1110)
  // G's Records box 3 -> everything inside G counts three times in F
  s = updateFolder(s, G.id, { recordCount: 3 })
  assert.equal(spend(s, G.id), 110)           // G on its own page is unchanged
  assert.equal(spend(s, F.id), 1000 + 110 * 3)
  // trash on G with no taps: starting records 3 -> 2
  s = updateFolder(s, G.id, { recordCount: 2 })
  assert.equal(spend(s, F.id), 1000 + 110 * 2)
  // a new checklist anywhere inside is picked up by every folder above it
  ;[s] = checklist(s, H.id, 'H-second', 5, { baseRecord: 4 })
  assert.equal(spend(s, H.id), 30)
  assert.equal(spend(s, G.id), 130)
  assert.equal(spend(s, F.id), 1000 + 130 * 2)
})

test('"+ Add item" on an inner folder = one more copy of its value (Records = Record count + taps)', () => {
  let [s, F] = folder(empty(), 'F')
  let G
  ;[s, G] = folder(s, 'G', F.id, { recordCount: 3 })
  ;[s] = checklist(s, G.id, 'G-list', 100, { baseRecord: 1 })
  assert.equal(spend(s, F.id), 300)           // Records 3
  s = addSavingAreaEntry(s, { ownerFolderId: F.id, sourceType: 'folder', sourceId: G.id })
  s = addSavingAreaEntry(s, { ownerFolderId: F.id, sourceType: 'folder', sourceId: G.id })
  assert.equal(spend(s, F.id), 500)           // Records 5
  s = removeSavingAreaEntry(s, last(s.savingAreaEntries).id)
  assert.equal(spend(s, F.id), 400)           // trash removes one tap
})

test('a page counts only what is in its Saving Area; folders bring their whole value', () => {
  let [s, F] = folder(empty(), 'F')
  let G, a
  ;[s, a] = checklist(s, null, 'Tea', 15, { frequency: 'daily', sectionId: 'expense' })
  ;[s, G] = folder(s, 'G', F.id)
  ;[s] = checklist(s, G.id, 'G-list', 100, { baseRecord: 2 })
  ;[s] = checklist(s, F.id, 'F-list', 40, { baseRecord: 1 })
  const page = 'page:daily'
  assert.equal(spend(s, page), 0)             // nothing added yet
  s = addSavingAreaEntry(s, { ownerFolderId: page, sourceType: 'checklist', sourceId: a.id })
  s = addSavingAreaEntry(s, { ownerFolderId: page, sourceType: 'checklist', sourceId: a.id, amount: 56 })
  assert.equal(spend(s, page), 71)
  s = addSavingAreaEntry(s, { ownerFolderId: page, sourceType: 'folder', sourceId: F.id })
  assert.equal(spend(s, page), 71 + 240)      // 40 + G (200)
  // editing inside F changes the page straight away
  ;[s] = checklist(s, G.id, 'more', 10, { baseRecord: 1 })
  assert.equal(spend(s, page), 71 + 250)
  assert.equal(spend(s, page), 71 + spend(s, F.id))
})

test('hidden (deleted) folders count nothing, restored ones count again', () => {
  let [s, F] = folder(empty(), 'F')
  let G
  ;[s, G] = folder(s, 'G', F.id)
  ;[s] = checklist(s, G.id, 'g', 100, { baseRecord: 1 })
  s = addSavingAreaEntry(s, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: G.id })
  assert.equal(spend(s, F.id), 100)
  assert.equal(spend(s, 'page:daily'), 100)
  s = setFolderHidden(s, G.id, true)
  assert.equal(spend(s, F.id), 0)
  assert.equal(spend(s, 'page:daily'), 0)
  s = setFolderHidden(s, G.id, false)
  assert.equal(spend(s, F.id), 100)
})

test('"+ Edit" copy starts with exactly the original value, then follows its own edits only', () => {
  let [s, F] = folder(empty(), 'F')
  let G, c
  ;[s, c] = checklist(s, F.id, 'f', 500, { baseRecord: 1 })
  s = tx(s, c, 500)                           // Records 2
  ;[s, G] = folder(s, 'G', F.id, { recordCount: 2 })
  let g; [s, g] = checklist(s, G.id, 'g', 100, { baseRecord: 1 })
  s = addSavingAreaEntry(s, { ownerFolderId: F.id, sourceType: 'folder', sourceId: G.id })
  s = addSavingAreaEntry(s, { ownerFolderId: F.id, sourceType: 'checklist', sourceId: c.id, amount: 30 })
  const before = spend(s, F.id)
  assert.equal(before, 1000 + 100 * 2 + 100 + 30)
  s = copyFolderToSavingArea(s, { folderId: F.id, ownerFolderId: 'page:daily', id: 'copy' })
  assert.equal(spend(s, 'copy'), before)
  assert.equal(spend(s, 'page:daily'), before) // the copy's entry carries the same value
  assert.equal(spend(s, F.id), before)         // original untouched
  // edit the copy: new checklist inside
  const cp = s.folders.find((f) => f.id === 'copy')
  ;[s] = checklist(s, cp.id, 'extra', 70, { baseRecord: 1 })
  assert.equal(spend(s, 'copy'), before + 70)
  assert.equal(spend(s, 'page:daily'), before + 70)
  assert.equal(spend(s, F.id), before)
  // removing the copy's entry removes the copy and its value
  s = removeSavingAreaEntry(s, s.savingAreaEntries.find((e) => e.ownerFolderId === 'page:daily').id)
  assert.equal(spend(s, 'page:daily'), 0)
  assert.equal(s.folders.some((f) => f.id === 'copy'), false)
  assert.equal(spend(s, F.id), before)
})

test('invalid record counts are rejected', () => {
  let [s, F] = folder(empty(), 'F')
  let c; [s, c] = checklist(s, F.id, 'c', 5, { baseRecord: 1 })
  assert.throws(() => updateFolder(s, F.id, { recordCount: 0 }))
  assert.throws(() => updateFolder(s, F.id, { recordCount: 1.5 }))
  assert.throws(() => updateChecklistTemplate(s, c.id, { baseRecord: -1 }))
})

test('entries pointing at each other do not loop forever', () => {
  let [s, F] = folder(empty(), 'F')
  let G; [s, G] = folder(s, 'G', F.id)
  ;[s] = checklist(s, F.id, 'f', 10, { baseRecord: 1 })
  s = addSavingAreaEntry(s, { ownerFolderId: F.id, sourceType: 'folder', sourceId: G.id })
  s = addSavingAreaEntry(s, { ownerFolderId: G.id, sourceType: 'folder', sourceId: F.id })
  assert.ok(Number.isFinite(spend(s, F.id)))
})
