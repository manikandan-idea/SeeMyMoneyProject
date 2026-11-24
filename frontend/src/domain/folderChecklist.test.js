// Run with: node --test src/domain/folderChecklist.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFolder, updateFolder, setFolderHidden, duplicateFolderStructure,
  createChecklistTemplate, updateChecklistTemplate, deleteChecklistTemplate, updateSavingAreaEntryAmount,
  addSavingAreaEntry, settleSavingAreaEntries, selectFolderTree,
  selectHiddenFolders, groupSavingAreaEntries, periodKeyFor,
  copyFolderToSavingArea, removeSavingAreaEntry, restoreSavingAreaEntry, collectEntryTree, hashFolder, mergeIdenticalCopy,
} from './folderChecklist.js'
import { calculateOwnerValue, calculateFolderView, checklistRecordCount, folderRecordCount } from './analytics.js'
import { createTransaction } from './records.js'

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
  assert.deepEqual(s2.checklists, s.checklists)
  assert.equal(s2.folders.length, s.folders.length + 1) // a folder entry is its own fresh copy...
  assert.equal(s2.folders.find((f) => f.id === inner.id), s.folders.find((f) => f.id === inner.id)) // ...the original is untouched
  assert.notEqual(s2.savingAreaEntries[2].sourceId, inner.id)
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
  assert.equal(t.savingAreaEntries[0].amount, 15) // the entry keeps its own copy of the amount
  const groups = groupSavingAreaEntries(t.savingAreaEntries)
  assert.deepEqual(groups.map((g) => [g.amount, g.count]), [[15, 1], [40, 2]])
})

test('calculateOwnerValue: a folder is the sum of its entries; folder entries bring that folder value', () => {
  const { s, daily, inner, tea } = seeded()
  let t = createChecklistTemplate(s, { folderId: inner.id, title: 'Bus', defaultAmount: 50, transactionType: 'income' })
  const bus = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id })
  t = addSavingAreaEntry(t, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id, amount: 40 })
  t = addSavingAreaEntry(t, { ownerFolderId: inner.id, sourceType: 'checklist', sourceId: bus.id })
  t = addSavingAreaEntry(t, { ownerFolderId: daily.id, sourceType: 'folder', sourceId: inner.id })
  const v = calculateOwnerValue(t, daily.id)
  assert.equal(v.expense, 15 + 40)
  assert.equal(v.income, 50)       // + the inner folder's value (once)
  // page level: adding the folder to a page's Saving Area carries its whole value
  const page = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: daily.id })
  assert.deepEqual(calculateOwnerValue(page, 'page:daily'), { income: 50, expense: 55, saving: 0 })
  // folder view = recorded transactions + entries + inner folders
  assert.equal(calculateFolderView(page, daily.id).expense, 55)
})

test('copyFolderToSavingArea: the copy starts with the original entries (re-pointed at the copy)', () => {
  const { s, daily, tea } = seeded()
  let t = addSavingAreaEntry(s, { ownerFolderId: daily.id, sourceType: 'checklist', sourceId: tea.id, amount: 30 })
  t = copyFolderToSavingArea(t, { folderId: daily.id, ownerFolderId: 'page:daily', id: 'cp' })
  assert.equal(calculateOwnerValue(t, 'cp').expense, 30) // copy: entries only, transactions are never copied
  const copiedTea = t.checklists.find((c) => c.folderId === 'cp')
  assert.ok(t.savingAreaEntries.some((e) => e.ownerFolderId === 'cp' && e.sourceId === copiedTea.id))
  assert.equal(calculateOwnerValue(t, daily.id).expense, 30) // original unchanged
})

test('folder value = its Saving Area only: one record of 7000 is 7000, never doubled', () => {
  const { s, daily, inner } = seeded()
  let t = createChecklistTemplate(s, { folderId: inner.id, title: 'Lunch', defaultAmount: 3500, transactionType: 'expense' })
  const lunch = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: inner.id, sourceType: 'checklist', sourceId: lunch.id })
  t = addSavingAreaEntry(t, { ownerFolderId: inner.id, sourceType: 'checklist', sourceId: lunch.id })
  assert.equal(calculateFolderView(t, inner.id).expense, 7000)
  // the inner folder counts once (its Records box says 1) until it is added to the parent's Saving Area
  assert.equal(calculateFolderView(t, daily.id).expense, 7000)
  // ONE record (a "+ Edit" copy) in the parent's Saving Area -> parent = that one record, 7000
  const own = { ...t, savingAreaEntries: t.savingAreaEntries.filter((e) => e.ownerFolderId === inner.id), transactions: [] }
  const u = copyFolderToSavingArea(own, { folderId: inner.id, ownerFolderId: daily.id, id: 'cp2' })
  assert.equal(calculateFolderView(u, daily.id).expense, 7000)
  assert.equal(calculateFolderView(u, inner.id).expense, 7000) // original not added again
  // any later change shows in the card and the parent at once
  const v = addSavingAreaEntry(u, { ownerFolderId: 'cp2', sourceType: 'checklist', sourceId: u.checklists.find((c) => c.folderId === 'cp2').id })
  assert.equal(calculateFolderView(v, daily.id).expense, 10500)
  assert.equal(checklistRecordCount(u, lunch), 2)
})

test('page / folder totals pull ONLY from the Saving Area container, never from the Checklist or Folder containers', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'lunch folder', usage: 'daily' })
  const lunch = lastFolder(t)
  t = createChecklistTemplate(t, { folderId: null, title: 'morning snakes', defaultAmount: 20, frequency: 'daily' })
  const snakes = lastList(t)
  t = createChecklistTemplate(t, { folderId: null, title: 'bus fare', defaultAmount: 50, frequency: 'daily' })
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'meal', defaultAmount: 159 })
  const meal = lastList(t)
  // everything above sits in the Checklist / Folder containers: nothing counts yet
  assert.deepEqual(calculateOwnerValue(t, 'page:daily'), { income: 0, expense: 0, saving: 0 })
  assert.deepEqual(calculateFolderView(t, lunch.id), { income: 0, expense: 0, saving: 0 })
  // put items in the Saving Area container: only those count
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: meal.id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: snakes.id, amount: 56 })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.deepEqual(calculateOwnerValue(t, 'page:daily'), { income: 0, expense: 56 + 159, saving: 0 })
  assert.equal(calculateFolderView(t, lunch.id).expense, 159) // bus fare (never added) is nowhere
})

test('Saving Area items are independent snapshots: editing / deleting the originals never changes them', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'lunch folder', usage: 'daily' })
  const lunch = lastFolder(t)
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'meal', defaultAmount: 100 })
  const meal = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: meal.id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 100)

  // edit the checklist in the Checklist container, and the folder's own contents
  t = updateChecklistTemplate(t, meal.id, { defaultAmount: 999 })
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'extra', defaultAmount: 5 })
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: lastList(t).id })
  assert.equal(calculateFolderView(t, lunch.id).expense, 100 + 5)   // the original folder follows its own edits
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 100)  // the copy already in the Saving Area does not
  assert.equal(t.savingAreaEntries.find((e) => e.sourceId === meal.id).amount, 100)

  // delete the checklist template: the Saving Area records stay
  t = deleteChecklistTemplate(t, meal.id)
  assert.equal(calculateFolderView(t, lunch.id).expense, 100 + 5) // the folder's own Saving Area keeps its records too
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 100)

  // adding again creates a NEW editable folder, even with the same name
  const before = t.folders.length
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.equal(t.folders.length, before + 1)
  const copies = t.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:daily').map((e) => e.sourceId)
  assert.equal(new Set(copies).size, 2)
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 100 + 105)
  // editing one copy leaves the other copy and the original alone
  const [c1] = copies
  const c1Entry = t.savingAreaEntries.find((e) => e.ownerFolderId === c1)
  t = updateSavingAreaEntryAmount(t, [c1Entry.id], 7)
  assert.equal(calculateFolderView(t, c1).expense, 7)
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 7 + 105)
  assert.equal(calculateFolderView(t, lunch.id).expense, 105)
})

test('removing a Saving Area folder record and undoing it brings the whole copy back', () => {
  const { s, daily, inner } = seeded()
  let t = createChecklistTemplate(s, { folderId: inner.id, title: 'Bus', defaultAmount: 50, transactionType: 'income' })
  t = addSavingAreaEntry(t, { ownerFolderId: inner.id, sourceType: 'checklist', sourceId: lastList(t).id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: inner.id })
  const entry = t.savingAreaEntries.find((e) => e.ownerFolderId === 'page:daily')
  const tree = collectEntryTree(t, entry)
  const removed = removeSavingAreaEntry(t, entry.id)
  assert.equal(removed.folders.length, t.folders.length - 1)
  assert.equal(calculateOwnerValue(removed, 'page:daily').income, 0)
  const back = restoreSavingAreaEntry(removed, entry, tree)
  assert.equal(calculateOwnerValue(back, 'page:daily').income, 50)
  assert.equal(back.folders.length, t.folders.length)
})

test('fingerprints: same content = same item again, any edit = a different item', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'lunch folder', usage: 'daily' })
  const lunch = lastFolder(t)
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'meal', defaultAmount: 100 })
  const meal = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: meal.id })
  const h0 = hashFolder(t, lunch.id)
  assert.equal(hashFolder(t, lunch.id), h0)                       // stable
  // "+ Add item" three times with nothing changed -> ONE copy, three records
  for (let i = 0; i < 3; i += 1) t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  const page = () => t.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:daily')
  assert.equal(new Set(page().map((e) => e.sourceId)).size, 1)
  assert.equal(page().length, 3)
  assert.equal(t.folders.filter((f) => f.savingCopy).length, 1)
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 300)
  // edit the folder (the Folder container) -> nothing in the Saving Area moves
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'tea', defaultAmount: 10 })
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: lastList(t).id })
  assert.notEqual(hashFolder(t, lunch.id), h0)                    // different fingerprint now
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 300)
  // add it again -> a different fingerprint is a different folder
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.equal(new Set(page().map((e) => e.sourceId)).size, 2)
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 300 + 110)
  // put the folder back as it was (remove the edit) is not needed: same content added again = same item
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.equal(new Set(page().map((e) => e.sourceId)).size, 2)
  assert.equal(page().length, 5)
})

test('fingerprints: checklist records group by content, not by which template they came from', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'F', usage: 'daily' })
  t = createChecklistTemplate(t, { folderId: null, title: 'bus fare', defaultAmount: 50, frequency: 'daily' })
  const bus = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: bus.id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: bus.id })
  t = updateChecklistTemplate(t, bus.id, { defaultAmount: 60 })               // edit in the Checklist container
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: bus.id })
  const groups = groupSavingAreaEntries(t.savingAreaEntries)
  assert.deepEqual(groups.map((g) => [g.amount, g.count]), [[50, 2], [60, 1]])
  // "+" on the old row repeats that exact record (50), whatever the template says now
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'checklist', sourceId: bus.id, cloneOf: t.savingAreaEntries[0].id })
  assert.deepEqual(groupSavingAreaEntries(t.savingAreaEntries).map((g) => [g.amount, g.count]), [[50, 3], [60, 1]])
  // editing the amount of a row changes its fingerprint, and rows with equal fingerprints merge
  t = updateSavingAreaEntryAmount(t, t.savingAreaEntries.filter((e) => e.amount === 60).map((e) => e.id), 50)
  assert.deepEqual(groupSavingAreaEntries(t.savingAreaEntries).map((g) => [g.amount, g.count]), [[50, 4]])
})

test('fingerprints: finishing a "+ Edit" with no change merges into the identical folder already there', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'lunch folder', usage: 'daily' })
  const lunch = lastFolder(t)
  t = createChecklistTemplate(t, { folderId: lunch.id, title: 'meal', defaultAmount: 100 })
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'checklist', sourceId: lastList(t).id })
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  t = copyFolderToSavingArea(t, { folderId: lunch.id, ownerFolderId: 'page:daily', id: 'cp-x' })
  assert.equal(t.folders.filter((f) => f.savingCopy).length, 2)
  t = mergeIdenticalCopy(t, 'page:daily', 'cp-x')
  assert.equal(t.folders.filter((f) => f.savingCopy).length, 1)
  assert.equal(t.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:daily').length, 2)
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 200)
})

test('folder total reflects the folders inside it by their Records box, and never twice', () => {
  let t = createFolder(base(), { sectionId: 'expense', parentFolderId: null, name: 'lunch folder', usage: 'daily' })
  const lunch = lastFolder(t)
  t = createFolder(t, { sectionId: 'expense', parentFolderId: lunch.id, name: 'Folder 1' })
  const f1 = lastFolder(t)
  t = createChecklistTemplate(t, { folderId: f1.id, title: 'x', defaultAmount: 3000 })
  const x = lastList(t)
  t = addSavingAreaEntry(t, { ownerFolderId: f1.id, sourceType: 'checklist', sourceId: x.id })
  t = addSavingAreaEntry(t, { ownerFolderId: f1.id, sourceType: 'checklist', sourceId: x.id })
  assert.equal(calculateFolderView(t, f1.id).expense, 6000)
  assert.equal(calculateFolderView(t, lunch.id).expense, 6000)         // Folder 1 (Records 1) is inside lunch
  assert.equal(folderRecordCount(t, f1, lunch.id), 1)
  // "+ Add item" on Folder 1 inside lunch: one record added -> still 6000, Records 1, not doubled
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'folder', sourceId: f1.id })
  assert.equal(calculateFolderView(t, lunch.id).expense, 6000)
  assert.equal(folderRecordCount(t, f1, lunch.id), 1)
  // again (same content, same record) -> 2 records -> 12000
  t = addSavingAreaEntry(t, { ownerFolderId: lunch.id, sourceType: 'folder', sourceId: f1.id })
  assert.equal(calculateFolderView(t, lunch.id).expense, 12000)
  assert.equal(folderRecordCount(t, f1, lunch.id), 2)
  // a change inside Folder 1 reaches lunch's card at once... but not the records already added
  t = addSavingAreaEntry(t, { ownerFolderId: f1.id, sourceType: 'checklist', sourceId: x.id })
  assert.equal(calculateFolderView(t, f1.id).expense, 9000)
  assert.equal(calculateFolderView(t, lunch.id).expense, 12000)
  // lunch added to the day page: the copy carries Folder 1 and its records without doubling
  t = addSavingAreaEntry(t, { ownerFolderId: 'page:daily', sourceType: 'folder', sourceId: lunch.id })
  assert.equal(calculateOwnerValue(t, 'page:daily').expense, 12000)
})
