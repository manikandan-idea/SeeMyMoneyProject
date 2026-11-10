// Acceptance flows from the shared contract, run on the real migrated sample data
// through the same pure functions App.jsx passes to commit().
import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleData } from '../src/data/sampleData.js'
import { migrateLegacyData } from '../src/data/migrations.js'
import { assertValidAppState } from '../src/data/schema.js'
import {
  createTransaction, updateTransactionAmount, deleteTransaction,
  selectHistoryRecords, groupTransactionsByChecklistAndAmount, getChecklistUsageCount,
} from '../src/domain/records.js'
import {
  updateChecklistTemplate, deleteChecklistTemplate, addSavingAreaEntry,
  settleSavingAreaEntries, setFolderHidden, createFolder,
} from '../src/domain/folderChecklist.js'
import { calculateSectionTotals, calculatePeriodTotals } from '../src/domain/analytics.js'

const base = () => migrateLegacyData(sampleData).state
const tea = (s) => s.checklists.find((c) => c.id === 'cl-tea')

function teaState() {
  let s = base()
  const c = tea(s)
  for (let i = 0; i < 5; i++) s = createTransaction(s, { sectionId: c.sectionId, folderId: c.folderId, checklistId: c.id, amount: 15, source: 'checklist' })
  s = createTransaction(s, { sectionId: c.sectionId, folderId: c.folderId, checklistId: c.id, amount: 20, source: 'checklist-other' })
  return s
}

test('migrated sample state is valid', () => assertValidAppState(base()))

test('Tea 5x15 + 1x20: six rows, usage 6, groups 5 and 1', () => {
  const s = teaState()
  const rows = s.transactions.filter((t) => t.checklistId === 'cl-tea')
  assert.equal(rows.length, 6)
  assert.equal(new Set(rows.map((r) => r.id)).size, 6)
  assert.equal(getChecklistUsageCount(s, 'cl-tea'), 6)
  const groups = groupTransactionsByChecklistAndAmount(rows).map((g) => [g.amount, g.count]).sort()
  assert.deepEqual(groups, [[15, 5], [20, 1]])
})

test('default change and one-time override leave history and default alone', () => {
  let s = teaState()
  const before = s.transactions.map((t) => t.amount)
  const oldDefault = tea(s).defaultAmount
  assert.equal(tea(s).defaultAmount, oldDefault) // override did not change it
  s = updateChecklistTemplate(s, 'cl-tea', { defaultAmount: 99 })
  assert.deepEqual(s.transactions.map((t) => t.amount), before)
})

test('deleting the checklist keeps all transactions', () => {
  const s = teaState()
  const next = deleteChecklistTemplate(s, 'cl-tea')
  assert.equal(next.checklists.some((c) => c.id === 'cl-tea'), false)
  assert.equal(next.transactions, s.transactions)
  assert.equal(selectHistoryRecords(next, {}).filter((t) => t.checklistId === 'cl-tea').length, 6)
  assert.equal(next.savingAreaEntries, s.savingAreaEntries)
})

test('deleting one record removes exactly that id', () => {
  const s = teaState()
  const id = s.transactions.find((t) => t.checklistId === 'cl-tea' && t.amount === 15).id
  const next = deleteTransaction(s, id)
  assert.equal(next.transactions.length, s.transactions.length - 1)
  assert.equal(getChecklistUsageCount(next, 'cl-tea'), 5)
})

test('editing one amount moves only that record to another group', () => {
  const s = teaState()
  const id = s.transactions.find((t) => t.checklistId === 'cl-tea' && t.amount === 15).id
  const next = updateTransactionAmount(s, id, 20)
  const g = groupTransactionsByChecklistAndAmount(next.transactions.filter((t) => t.checklistId === 'cl-tea')).map((x) => [x.amount, x.count]).sort()
  assert.deepEqual(g, [[15, 4], [20, 2]])
})

test('saving area add + settle: entries only, IDs kept, idempotent, totals unchanged', () => {
  let s = base()
  const c = tea(s)
  const target = createFolder(s, { sectionId: c.sectionId, parentFolderId: null, name: 'Target', usage: 'monthly' })
  const targetId = target.folders[target.folders.length - 1].id
  s = target
  const txBefore = s.transactions, tplBefore = s.checklists.length, totalBefore = calculateSectionTotals(s, c.sectionId)
  s = addSavingAreaEntry(s, { sectionId: c.sectionId, ownerFolderId: c.folderId, sourceType: 'checklist', sourceId: c.id })
  s = addSavingAreaEntry(s, { sectionId: c.sectionId, ownerFolderId: c.folderId, sourceType: 'checklist', sourceId: c.id })
  assert.equal(s.savingAreaEntries.length, 2)
  assert.equal(s.transactions, txBefore)
  assert.equal(s.checklists.length, tplBefore)
  const ids = s.savingAreaEntries.map((e) => e.id)
  const moved = settleSavingAreaEntries(s, { sourceFolderId: c.folderId, targetFolderId: targetId })
  assert.deepEqual(moved.savingAreaEntries.map((e) => e.id), ids)
  assert.ok(moved.savingAreaEntries.every((e) => e.ownerFolderId === targetId))
  assert.equal(settleSavingAreaEntries(moved, { sourceFolderId: c.folderId, targetFolderId: targetId }).savingAreaEntries.length, 2)
  assert.deepEqual(calculateSectionTotals(moved, c.sectionId), totalBefore)
})

test('hide/restore keeps transactions and totals; sections stay separate', () => {
  const s = teaState()
  const c = tea(s)
  const t0 = calculatePeriodTotals(s, {})
  const hidden = setFolderHidden(s, c.folderId, true)
  assert.equal(hidden.transactions, s.transactions)
  assert.deepEqual(calculatePeriodTotals(hidden, {}), t0)
  assert.deepEqual(calculatePeriodTotals(setFolderHidden(hidden, c.folderId, false), {}), t0)
  const sum = ['income', 'expense', 'saving'].map((id) => calculateSectionTotals(s, id).total)
  assert.equal(t0.income, sum[0]); assert.equal(t0.expense, sum[1]); assert.equal(t0.saving, sum[2])
})

test('checklist directly on a page (no folder): create, record, edit default, delete keeps history', async () => {
  const { createChecklistTemplate } = await import('../src/domain/folderChecklist.js')
  let s = createChecklistTemplate(base(), { title: 'Milk', defaultAmount: 30, transactionType: 'expense', frequency: 'daily', folderId: null })
  assertValidAppState(s)
  const c = s.checklists[s.checklists.length - 1]
  assert.equal(c.folderId, null)
  assert.equal(c.sectionId, 'expense')
  assert.equal(c.frequency, 'daily')
  s = createTransaction(s, { sectionId: c.sectionId, folderId: null, checklistId: c.id, amount: 30, source: 'checklist' })
  s = createTransaction(s, { sectionId: c.sectionId, folderId: null, checklistId: c.id, amount: 45, source: 'checklist-other' })
  assert.equal(getChecklistUsageCount(s, c.id), 2)
  s = updateChecklistTemplate(s, c.id, { defaultAmount: 35 })
  assert.deepEqual(s.transactions.filter((t) => t.checklistId === c.id).map((t) => t.amount), [30, 45])
  const after = deleteChecklistTemplate(s, c.id)
  assert.equal(after.transactions.filter((t) => t.checklistId === c.id).length, 2)
})

test('every folder and every period page has a Saving Area (entries, not money)', async () => {
  const { addSavingAreaEntry, settleSavingAreaEntries, pageOwnerId } = await import('../src/domain/folderChecklist.js')
  let s = base()
  const c = tea(s)
  const money = JSON.stringify(calculatePeriodTotals(s, {}))
  // inside a folder
  s = addSavingAreaEntry(s, { ownerFolderId: c.folderId, sourceType: 'checklist', sourceId: c.id })
  // on a period page (page = virtual folder)
  s = addSavingAreaEntry(s, { ownerFolderId: pageOwnerId('daily'), sourceType: 'checklist', sourceId: c.id })
  s = addSavingAreaEntry(s, { ownerFolderId: pageOwnerId('daily'), sourceType: 'folder', sourceId: c.folderId })
  assertValidAppState(s)
  assert.equal(s.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:daily').length, 2)
  assert.equal(JSON.stringify(calculatePeriodTotals(s, {})), money)
  assert.ok(s.checklists.some((x) => x.id === c.id))
  const ids = s.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:daily').map((e) => e.id)
  const moved = settleSavingAreaEntries(s, { sourceFolderId: 'page:daily', targetFolderId: 'page:monthly' })
  assert.deepEqual(moved.savingAreaEntries.filter((e) => e.ownerFolderId === 'page:monthly').map((e) => e.id), ids)
})
