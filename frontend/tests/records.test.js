import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTransaction, updateTransactionAmount, deleteTransaction,
  selectHistoryRecords, groupTransactionsByChecklistAndAmount,
  getChecklistUsageCount, localDateKey,
} from '../src/domain/records.js'

const base = () => ({
  schemaVersion: 1,
  sections: [],
  folders: [{ id: 'f1', sectionId: 'expense', parentFolderId: null, name: 'Daily' }],
  checklists: [{ id: 'tea', sectionId: 'expense', folderId: 'f1', title: 'Tea', defaultAmount: 15, transactionType: 'expense' }],
  transactions: [],
  savingAreaEntries: [{ id: 's1', ownerFolderId: 'f1', sourceType: 'checklist', sourceId: 'tea' }],
})
const rec = (s, amount, source = 'checklist', now) =>
  createTransaction(s, { checklistId: 'tea', amount, source, now })

function teaState() {
  let s = base()
  for (let i = 0; i < 5; i++) s = rec(s, 15, 'checklist', new Date(2026, 10, 1, 9, i))
  return rec(s, 20, 'checklist-other', new Date(2026, 10, 2, 9, 0))
}

test('5x15 + 1x20 -> 6 rows, usage 6, two groups (5,1)', () => {
  const s = teaState()
  assert.equal(s.transactions.length, 6)
  assert.equal(new Set(s.transactions.map((t) => t.id)).size, 6)
  assert.equal(getChecklistUsageCount(s, 'tea'), 6)
  const g = groupTransactionsByChecklistAndAmount(s.transactions)
  assert.deepEqual(g.map((x) => [x.amount, x.count]).sort(), [[15, 5], [20, 1]])
  assert.equal(s.transactions.length, 6) // grouping did not alter rows
})

test('snapshots and no mutation of input', () => {
  const s0 = base()
  const frozen = JSON.stringify(s0)
  const s1 = rec(s0, 15)
  assert.equal(JSON.stringify(s0), frozen)
  const t = s1.transactions[0]
  assert.equal(t.checklistTitleSnapshot, 'Tea')
  assert.equal(t.folderNameSnapshot, 'Daily')
  assert.equal(t.transactionType, 'expense')
  assert.equal(t.folderId, 'f1')
  assert.equal(s1.checklists[0].defaultAmount, 15)
})

test('override does not change template default', () => {
  const s = rec(base(), 20, 'checklist-other')
  assert.equal(s.checklists[0].defaultAmount, 15)
})

test('standalone entry', () => {
  const s = createTransaction(base(), { sectionId: 'income', description: 'Gift', amount: 500, source: 'other' })
  const t = s.transactions[0]
  assert.equal(t.checklistId, null)
  assert.equal(t.transactionType, 'income')
  assert.equal(t.folderId, null)
})

test('validation', () => {
  assert.throws(() => createTransaction(base(), { sectionId: 'income', description: 'x', amount: 0 }))
  assert.throws(() => createTransaction(base(), { sectionId: 'income', description: 'x', amount: '5' }))
  assert.throws(() => createTransaction(base(), { checklistId: 'nope', amount: 5 }))
  assert.throws(() => createTransaction(base(), { sectionId: 'bad', description: 'x', amount: 5 }))
  assert.throws(() => createTransaction(base(), { sectionId: 'income', description: ' ', amount: 5 }))
})

test('local date, not UTC slice', () => {
  // 00:30 local on 1 Nov must stay 2026-11-01 regardless of timezone
  const d = new Date(2026, 10, 1, 0, 30)
  assert.equal(localDateKey(d), '2026-11-01')
  const s = rec(base(), 15, 'checklist', d)
  assert.equal(s.transactions[0].transactionDate, '2026-11-01')
})

test('template default change leaves history; template delete leaves history', () => {
  let s = teaState()
  s = { ...s, checklists: s.checklists.map((c) => ({ ...c, defaultAmount: 20 })) }
  assert.equal(s.transactions.filter((t) => t.amount === 15).length, 5)
  s = { ...s, checklists: [] } // as deleteChecklistTemplate does
  const h = selectHistoryRecords(s, {})
  assert.equal(h.length, 6)
  assert.ok(h.every((t) => t.checklistTitleSnapshot === 'Tea'))
  assert.equal(getChecklistUsageCount(s, 'tea'), 6)
})

test('delete removes exactly one, nothing else', () => {
  const s = teaState()
  const id = s.transactions[2].id
  const n = deleteTransaction(s, id)
  assert.equal(n.transactions.length, 5)
  assert.ok(!n.transactions.some((t) => t.id === id))
  assert.equal(n.checklists, s.checklists)
  assert.equal(n.folders, s.folders)
  assert.equal(n.savingAreaEntries, s.savingAreaEntries)
  assert.equal(getChecklistUsageCount(n, 'tea'), 5)
  assert.equal(deleteTransaction(n, 'missing'), n)
})

test('update amount changes one row only and regroups', () => {
  const s = teaState()
  const id = s.transactions[0].id
  const n = updateTransactionAmount(s, id, 20)
  assert.equal(n.transactions.filter((t) => t.id === id)[0].amount, 20)
  assert.equal(n.transactions.filter((t) => t.amount === 15).length, 4)
  assert.equal(n.checklists[0].defaultAmount, 15)
  assert.equal(s.transactions[0].amount, 15)
  const g = groupTransactionsByChecklistAndAmount(n.transactions)
  assert.deepEqual(g.map((x) => [x.amount, x.count]).sort(), [[15, 4], [20, 2]])
  assert.throws(() => updateTransactionAmount(s, id, -1))
})

test('history filters, search, order', () => {
  let s = teaState()
  s = createTransaction(s, { sectionId: 'income', description: 'Salary', amount: 1000, source: 'manual', now: new Date(2026, 10, 3, 10) })
  const all = selectHistoryRecords(s, {})
  assert.equal(all[0].description, 'Salary') // newest first
  assert.equal(selectHistoryRecords(s, { transactionType: 'income' }).length, 1)
  assert.equal(selectHistoryRecords(s, { search: 'TEA' }).length, 6)
  assert.equal(selectHistoryRecords(s, { fromDate: '2026-11-02', toDate: '2026-11-02' }).length, 1)
  assert.equal(selectHistoryRecords(s, { fromDate: '2026-11-04' }).length, 0)
})

test('unlinked groups by type+description+amount; saving entries not counted', () => {
  let s = base()
  for (let i = 0; i < 2; i++) s = createTransaction(s, { sectionId: 'expense', description: 'Auto', amount: 50, source: 'other' })
  s = createTransaction(s, { sectionId: 'income', description: 'Auto', amount: 50, source: 'other' })
  const g = groupTransactionsByChecklistAndAmount(s.transactions)
  assert.equal(g.length, 2)
  assert.equal(getChecklistUsageCount(s, 'tea'), 0)
})

// ---- undo / redo support for checklist rows ----
import { restoreTransaction, getLatestChecklistTransaction } from '../src/domain/records.js'

test('restoreTransaction puts a removed row back once; latest row of a checklist is found', () => {
  const mk = (id, at, amount) => ({
    id, sectionId: 'expense', folderId: null, folderNameSnapshot: null, checklistId: 'c1',
    checklistTitleSnapshot: 'Tea', description: 'Tea', amount, transactionType: 'expense',
    recordedAt: at, transactionDate: '2026-11-13', source: 'checklist',
  })
  const s = { transactions: [mk('a', '2026-11-13T05:00:00.000Z', 15), mk('b', '2026-11-13T06:00:00.000Z', 20)] }
  assert.equal(getLatestChecklistTransaction(s, 'c1').id, 'b')
  assert.equal(getLatestChecklistTransaction(s, 'nope'), null)
  const removed = s.transactions[1]
  const after = { transactions: s.transactions.filter((t) => t.id !== 'b') }
  assert.equal(getLatestChecklistTransaction(after, 'c1').id, 'a')
  const back = restoreTransaction(after, removed)
  assert.deepEqual(back.transactions.map((t) => t.id), ['a', 'b'])
  assert.equal(restoreTransaction(back, removed), back)
})
