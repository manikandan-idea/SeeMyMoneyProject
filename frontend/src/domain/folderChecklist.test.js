// Run with: node --test src/domain/folderChecklist.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFolder, updateFolder, setFolderHidden, duplicateFolderStructure,
  createChecklistTemplate, updateChecklistTemplate, deleteChecklistTemplate,
  addSavingAreaEntry, settleSavingAreaEntries, selectFolderTree,
  selectHiddenFolders, groupSavingAreaEntries, periodKeyFor,
  copyFolderToSavingArea, removeSavingAreaEntry,
} from './folderChecklist.js'

const base = () => ({
  schemaVersion: 1,
  sections: [
    { id: 'income', title: 'Income' },
    { id: 'expense', title: 'Expense' },
    { id: 'saving', title: 'Saving' },
  ],
  folders: [], checklists: [], transactions: [], savingAreaEntries: [],
})
const freeze = (o) => JSON.parse(JSON.stringify(o))
const lastFolder = (s) => s.folders[s.folders.length - 1]
const lastList = (s) => s.checklists[s.checklists.length - 1]

function seeded() {
  let s = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'Daily', usage: 'daily', othersEnabled: true })
  const daily = lastFolder(s)
  s = createFolder(s, { sectionId: 'expense', parentFolderId: daily.id, name: 'Inner', usage: 'occasional', frequency: 'multiple' })
  const inner = lastFolder(s)
  s = createChecklistTemplate(s, { folderId: daily.id, title: 'Tea', defaultAmount: 15 })
  const tea = lastList(s)
  s.transactions = [{ id: 't1', checklistId: tea.id, amount: 15 }, { id: 't2', checklistId: tea.id, amount: 20 }]
  return { s, daily, inner, tea }
}

test('createFolder: nested, ids unique, no input mutation', () => {
  const s0 = base()
  const before = freeze(s0)
  const { s, daily, inner } = seeded()
  assert.deepEqual(s0, before)
  assert.notEqual(daily.id, inner.id)
  assert.equal(inner.parentFolderId, daily.id)
  assert.equal(inner.sectionId, 'expense')
  assert.equal(daily.periodKey, periodKeyFor('daily'))
  assert.equal(inner.periodKey, null)
})

test('createFolder: validation', () => {
  assert.throws(() => createFolder(base(), { sectionId: 'nope', name: 'x' }))
  assert.throws(() => createFolder(base(), { sectionId: 'income', name: '  ' }))
  assert.throws(() => createFolder(base(), { sectionId: 'income', name: 'x', usage: 'occasional' }))
  const { s, daily } = seeded()
  assert.throws(() => createFolder(s, { sectionId: 'income', parentFolderId: daily.id, name: 'x' }))
  assert.throws(() => createFolder(s, { sectionId: 'expense', parentFolderId: 'missing', name: 'x' }))
})

test('createFolder: optional first checklist rows', () => {
  const s = createFolder(base(), {
    sectionId: 'income', name: 'Biz', usage: 'monthly',
    checklist: [{ title: 'Client', defaultAmount: 100 }],
  })
  assert.equal(s.checklists.length, 1)
  assert.equal(s.checklists[0].folderId, s.folders[0].id)
  assert.equal(s.checklists[0].frequency, 'monthly')
})

test('updateFolder: whitelist, normalises frequency', () => {
  const { s, inner } = seeded()
  const s2 = updateFolder(s, inner.id, { name: ' Renamed ', id: 'hack', sectionId: 'income', hidden: true })
  const f = s2.folders.find((x) => x.name === 'Renamed')
  assert.equal(f.id, inner.id)
  assert.equal(f.sectionId, 'expense')
  assert.equal(f.hidden, false)
  const s3 = updateFolder(s2, inner.id, { usage: 'yearly' })
  assert.equal(s3.folders.find((x) => x.id === inner.id).frequency, null)
  assert.throws(() => updateFolder(s, inner.id, { name: '' }))
  assert.throws(() => updateFolder(s, 'missing', { name: 'x' }))
})

test('setFolderHidden: only the folder row changes; restore works', () => {
  const { s, daily } = seeded()
  const hid = setFolderHidden(s, daily.id, true)
  assert.equal(hid.folders.find((f) => f.id === daily.id).hidden, true)
  assert.equal(hid.transactions, s.transactions)
  assert.equal(hid.checklists, s.checklists)
  assert.equal(hid.savingAreaEntries, s.savingAreaEntries)
  assert.equal(selectHiddenFolders(hid).length, 1)
  const back = setFolderHidden(hid, daily.id, false)
  assert.equal(back.folders.find((f) => f.id === daily.id).hidden, false)
  assert.equal(setFolderHidden(s, daily.id, false), s)
})

test('duplicateFolderStructure: new ids, structure only, no money copied', () => {
  let { s, daily, inner, tea } = seeded()
  s = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  s = setFolderHidden(s, daily.id, true)
  const s2 = duplicateFolderStructure(s, daily.id)
  assert.equal(s2.folders.length, s.folders.length + 2)
  assert.equal(s2.checklists.length, s.checklists.length + 1)
  assert.equal(s2.transactions, s.transactions)
  assert.equal(s2.savingAreaEntries.length, 1)
  const newFolders = s2.folders.slice(s.folders.length)
  const ids = new Set(s2.folders.map((f) => f.id))
  assert.equal(ids.size, s2.folders.length)
  const copyTop = newFolders.find((f) => f.parentFolderId === null)
  assert.equal(copyTop.name, 'Daily')
  assert.equal(copyTop.hidden, false)
  const copyInner = newFolders.find((f) => f.parentFolderId === copyTop.id)
  assert.equal(copyInner.name, inner.name)
  const copyTea = s2.checklists[s2.checklists.length - 1]
  assert.equal(copyTea.folderId, copyTop.id)
  assert.notEqual(copyTea.id, tea.id)
  assert.equal(copyTea.title, 'Tea')
})

test('createChecklistTemplate: defaults from context, validation', () => {
  const { s, daily, tea } = seeded()
  assert.equal(tea.transactionType, 'expense')
  assert.equal(tea.frequency, 'daily')
  assert.equal(tea.sectionId, 'expense')
  assert.equal(tea.folderId, daily.id)
  const s2 = createChecklistTemplate(s, { folderId: daily.id, title: 'Save', defaultAmount: 5, transactionType: 'saving' })
  assert.equal(lastList(s2).transactionType, 'saving')
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, title: 'x', defaultAmount: 0 }))
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, title: 'x', defaultAmount: '5' }))
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, title: '', defaultAmount: 5 }))
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, sectionId: 'income', title: 'x', defaultAmount: 5 }))
  assert.throws(() => createChecklistTemplate(s, { folderId: 'missing', title: 'x', defaultAmount: 5 }))
})

test('updateChecklistTemplate: changes template only, history untouched', () => {
  const { s, tea } = seeded()
  const s2 = updateChecklistTemplate(s, tea.id, { defaultAmount: 20 })
  assert.equal(s2.checklists[0].defaultAmount, 20)
  assert.equal(s2.transactions, s.transactions)
  assert.deepEqual(s2.transactions.map((t) => t.amount), [15, 20])
  assert.throws(() => updateChecklistTemplate(s, tea.id, { defaultAmount: -1 }))
  const s3 = updateChecklistTemplate(s, tea.id, { title: 'Chai' })
  assert.equal(s3.checklists[0].title, 'Chai')
})

test('deleteChecklistTemplate: removes only the template', () => {
  let { s, daily, tea } = seeded()
  s = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  const s2 = deleteChecklistTemplate(s, tea.id)
  assert.equal(s2.checklists.length, 0)
  assert.equal(s2.transactions, s.transactions)
  assert.equal(s2.savingAreaEntries, s.savingAreaEntries)
  assert.equal(s2.folders, s.folders)
  assert.equal(deleteChecklistTemplate(s2, tea.id), s2)
})

test('addSavingAreaEntry: separate rows, source untouched, no transactions', () => {
  const { s, daily, inner, tea } = seeded()
  let s2 = addSavingAreaEntry(s, { sectionId: 'expense', ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  s2 = addSavingAreaEntry(s2, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  s2 = addSavingAreaEntry(s2, { ownerFolderId: daily.id, sourceType: 'folder', sourceId: inner.id })
  assert.equal(s2.savingAreaEntries.length, 3)
  assert.equal(new Set(s2.savingAreaEntries.map((e) => e.id)).size, 3)
  assert.equal(s2.savingAreaEntries[0].titleSnapshot, 'Tea')
  assert.equal(s2.savingAreaEntries[2].titleSnapshot, 'Inner')
  assert.equal(s2.checklists, s.checklists)
  assert.equal(s2.folders, s.folders)
  assert.equal(s2.transactions, s.transactions)
  const groups = groupSavingAreaEntries(s2.savingAreaEntries)
  assert.deepEqual(groups.map((g) => g.count), [2, 1])
  assert.equal(s2.savingAreaEntries.length, 3) // grouping is display-only
  assert.throws(() => addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'folder', sourceId: daily.id }))
  assert.throws(() => addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'x', sourceId: tea.id }))
  assert.throws(() => addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: 'missing' }))
})

test('settleSavingAreaEntries: moves same ids, idempotent, validates target', () => {
  let { s, daily, inner, tea } = seeded()
  s = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  s = addSavingAreaEntry(s, { ownerFolderId: inner.id, sourceType: 'checklist', sourceId: tea.id })
  const ids = s.savingAreaEntries.map((e) => e.id)
  const moved = settleSavingAreaEntries(s, { sourceFolderId: daily.id, targetFolderId: inner.id })
  assert.deepEqual(moved.savingAreaEntries.map((e) => e.id), ids)
  assert.ok(moved.savingAreaEntries.every((e) => e.ownerFolderId === inner.id))
  assert.equal(moved.folders, s.folders)
  assert.equal(moved.checklists, s.checklists)
  assert.equal(moved.transactions, s.transactions)
  const again = settleSavingAreaEntries(moved, { sourceFolderId: daily.id, targetFolderId: inner.id })
  assert.equal(again, moved)
  assert.equal(again.savingAreaEntries.length, 2)
  assert.throws(() => settleSavingAreaEntries(s, { sourceFolderId: daily.id, targetFolderId: 'missing' }))
  assert.equal(s.savingAreaEntries[0].ownerFolderId, daily.id) // input not mutated
})

test('settleSavingAreaEntries: rejects cross-section target', () => {
  let { s, daily, tea } = seeded()
  s = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  s = createFolder(s, { sectionId: 'income', name: 'Other section' })
  assert.throws(() => settleSavingAreaEntries(s, { sourceFolderId: daily.id, targetFolderId: lastFolder(s).id }))
})

test('selectFolderTree: nesting, paths, per-section, same entity', () => {
  let { s, daily, inner, tea } = seeded()
  s = createFolder(s, { sectionId: 'income', name: 'Elsewhere' })
  s = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  const tree = selectFolderTree(s, 'expense')
  assert.equal(tree.folders.length, 1)
  assert.equal(tree.folders[0].folders[0].id, inner.id)
  assert.deepEqual(tree.byId[inner.id].path, [daily.id, inner.id])
  assert.equal(tree.byId[daily.id].checklists.length, 1)
  assert.equal(tree.byId[daily.id].savingAreaEntries.length, 1)
  assert.equal(selectFolderTree(s, 'income').folders.length, 1)
  assert.equal(selectFolderTree(s, 'saving').folders.length, 0)
  assert.equal(s.folders.length, 3) // reading creates nothing
})

test('selectHiddenFolders: ancestor names', () => {
  let { s, inner } = seeded()
  s = setFolderHidden(s, inner.id, true)
  assert.deepEqual(selectHiddenFolders(s)[0].names, ['Daily', 'Inner'])
})

// ---- card features ported from card_records.html ("Other" row, undo/redo, record count) ----
import { restoreChecklistTemplate } from './folderChecklist.js'

test('createChecklistTemplate: afterChecklistId puts the copy directly below; id and recordCount are kept', () => {
  let { s, daily, tea } = seeded()
  s = createChecklistTemplate(s, { folderId: daily.id, title: 'Snacks', defaultAmount: 30 })
  s = createChecklistTemplate(s, {
    id: 'copy-1', afterChecklistId: tea.id, folderId: daily.id, title: tea.title, defaultAmount: 20, recordCount: 3,
  })
  assert.deepEqual(s.checklists.map((c) => c.title), ['Tea', 'Tea', 'Snacks'])
  assert.equal(s.checklists[1].id, 'copy-1')
  assert.equal(s.checklists[1].defaultAmount, 20)
  assert.equal(s.checklists[1].recordCount, 3)
  assert.equal(s.checklists[0].recordCount, undefined)
  assert.throws(() => createChecklistTemplate(s, { id: 'copy-1', folderId: daily.id, title: 'x', defaultAmount: 1 }))
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, title: 'x', defaultAmount: 1, recordCount: 0 }))
  assert.throws(() => createChecklistTemplate(s, { folderId: daily.id, title: 'x', defaultAmount: 1, recordCount: 1.5 }))
})

test('createChecklistTemplate: page-level (no folder) copy goes below its original', () => {
  let s = createChecklistTemplate(base(), { folderId: null, sectionId: 'expense', title: 'Bus', defaultAmount: 89, transactionType: 'expense', frequency: 'daily' })
  const bus = lastList(s)
  s = createChecklistTemplate(s, { folderId: null, title: 'Snakes', defaultAmount: 20, transactionType: 'expense', frequency: 'daily' })
  s = createChecklistTemplate(s, {
    id: 'bus-2', afterChecklistId: bus.id, folderId: null, sectionId: bus.sectionId, title: bus.title,
    defaultAmount: 50, transactionType: bus.transactionType, frequency: bus.frequency,
  })
  assert.deepEqual(s.checklists.map((c) => c.title), ['Bus', 'Bus', 'Snakes'])
  assert.equal(s.checklists[1].folderId, null)
  assert.equal(s.checklists[1].frequency, 'daily')
})

test('createFolder: afterFolderId twin sits below its original; id and recordCount are kept', () => {
  let { s, daily, inner } = seeded()
  s = createFolder(s, { sectionId: 'expense', parentFolderId: daily.id, name: 'Other', usage: 'occasional', frequency: 'multiple' })
  s = createFolder(s, {
    id: 'twin-1', afterFolderId: inner.id, sectionId: 'expense', parentFolderId: daily.id, name: inner.name,
    usage: inner.usage, frequency: inner.frequency, recordCount: 2,
  })
  assert.deepEqual(s.folders.map((f) => f.name), ['Daily', 'Inner', 'Inner', 'Other'])
  assert.equal(s.folders[2].id, 'twin-1')
  assert.equal(s.folders[2].recordCount, 2)
})

test('restoreChecklistTemplate: same id and position back; no duplicates; missing folder ignored', () => {
  let { s, daily, tea } = seeded()
  s = createChecklistTemplate(s, { folderId: daily.id, title: 'Snacks', defaultAmount: 30 })
  const removed = tea
  const index = s.checklists.findIndex((c) => c.id === tea.id)
  s = deleteChecklistTemplate(s, tea.id)
  assert.equal(s.checklists.length, 1)
  s = restoreChecklistTemplate(s, removed, index)
  assert.deepEqual(s.checklists.map((c) => c.title), ['Tea', 'Snacks'])
  assert.equal(restoreChecklistTemplate(s, removed, index), s)
  assert.equal(restoreChecklistTemplate(s, { ...removed, id: 'x', folderId: 'gone' }, 0), s)
})

test('copyFolderToSavingArea: copy lives in the Saving Area, original untouched, copy removed with its last entry', () => {
  const { s, daily } = seeded()
  const before = freeze(s)
  const owner = 'page:daily'
  const t = copyFolderToSavingArea(s, { folderId: daily.id, ownerFolderId: owner, id: 'copy-1' })
  assert.deepEqual(s, before) // input not mutated
  // original folder, checklists and its inner folder are unchanged
  assert.deepEqual(t.folders.find((f) => f.id === daily.id), before.folders.find((f) => f.id === daily.id))
  assert.equal(t.checklists.filter((c) => c.folderId === daily.id).length, 1)
  // copy: new folder + copied checklist + copied inner folder; no transactions copied
  const copy = t.folders.find((f) => f.id === 'copy-1')
  assert.equal(copy.savingCopy, true)
  assert.equal(copy.parentFolderId, null)
  assert.equal(t.checklists.filter((c) => c.folderId === 'copy-1').length, 1)
  assert.equal(t.folders.filter((f) => f.parentFolderId === 'copy-1').length, 1)
  assert.equal(t.transactions.length, s.transactions.length)
  // exactly one Saving Area entry pointing at the copy
  assert.deepEqual(t.savingAreaEntries.map((e) => [e.ownerFolderId, e.sourceType, e.sourceId]), [[owner, 'folder', 'copy-1']])
  // copy is not a top-level folder in the tree
  assert.deepEqual(selectFolderTree(t, 'expense').folders.map((f) => f.id), [daily.id])
  // removing its only entry removes the copy and everything under it
  const u = removeSavingAreaEntry(t, t.savingAreaEntries[0].id)
  assert.deepEqual(u.folders, s.folders)
  assert.deepEqual(u.checklists, s.checklists)
  assert.equal(u.savingAreaEntries.length, 0)
})

test('addSavingAreaEntry: checklist entry can carry its own amount; separate rows per amount; no new checklist', () => {
  const { s, tea } = seeded()
  let t = addSavingAreaEntry(s, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: tea.id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: tea.id, amount: 40 })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: tea.id, amount: 40 })
  assert.equal(t.checklists.length, s.checklists.length)
  assert.equal(t.transactions.length, s.transactions.length)
  assert.equal(t.checklists.find((c) => c.id === tea.id).defaultAmount, 15)
  assert.equal(t.savingAreaEntries[0].amount, undefined)
  const groups = groupSavingAreaEntries(t.savingAreaEntries)
  assert.deepEqual(groups.map((g) => [g.amount, g.count]), [[undefined, 1], [40, 2]])
})
