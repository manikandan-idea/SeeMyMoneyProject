// Run with: node --test src/domain/analytics.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSectionTotals,
  calculateFolderTotals,
  calculatePeriodTotals,
  getRecentTransactions,
  calculateFolderBreakdown,
  getPeriodRange,
  toLocalDateKey,
} from './analytics.js'

let n = 0
const tx = (o) => ({
  id: `t${++n}`,
  sectionId: 'expense',
  folderId: null,
  folderNameSnapshot: null,
  checklistId: null,
  description: 'x',
  amount: 10,
  transactionType: o.sectionId ?? 'expense',
  recordedAt: '2026-08-10T10:00:00.000Z',
  transactionDate: '2026-08-10',
  source: 'manual',
  ...o,
})

const state = {
  schemaVersion: 1,
  folders: [
    { id: 'A', sectionId: 'expense', parentFolderId: null, name: 'Daily', hidden: true },
    { id: 'B', sectionId: 'expense', parentFolderId: 'A', name: 'Inner', hidden: false },
    { id: 'C', sectionId: 'income', parentFolderId: null, name: 'Biz', hidden: false },
  ],
  // Templates / Saving Area rows exist but must never be counted as money.
  checklists: [{ id: 'cl', defaultAmount: 999, timesRecorded: 50 }],
  savingAreaEntries: [{ id: 's1', amount: 12345 }, { id: 's2' }],
  transactions: [
    // Tea: 5 x 15 and 1 x 20 = six independent rows
    ...Array.from({ length: 5 }, () =>
      tx({ folderId: 'A', folderNameSnapshot: 'Daily', checklistId: 'cl', amount: 15, transactionDate: '2026-08-10' }),
    ),
    tx({ folderId: 'A', folderNameSnapshot: 'Daily', checklistId: 'cl', amount: 20, transactionDate: '2026-08-11' }),
    tx({ folderId: 'B', amount: 7, transactionDate: '2026-09-01', recordedAt: '2026-09-01T08:00:00.000Z' }),
    tx({ sectionId: 'expense', amount: 100, transactionDate: '2026-08-31', recordedAt: '2026-08-31T18:40:00.000Z' }),
    tx({ sectionId: 'income', folderId: 'C', amount: 50000, transactionDate: '2026-08-01' }),
    tx({ sectionId: 'saving', amount: 2500, transactionDate: '2026-08-15' }),
    tx({ sectionId: 'expense', amount: 5, transactionDate: null, recordedAt: '2026-01-01T00:00:00.000Z' }),
  ],
}

test('section totals are recursive over every transaction in the section', () => {
  assert.deepEqual(calculateSectionTotals(state, 'expense'), { sectionId: 'expense', total: 75 + 20 + 7 + 100 + 5, count: 9 })
  assert.deepEqual(calculateSectionTotals(state, 'income'), { sectionId: 'income', total: 50000, count: 1 })
  assert.deepEqual(calculateSectionTotals(state, 'saving'), { sectionId: 'saving', total: 2500, count: 1 })
})

test('Tea 5x15 + 1x20 counts as six transactions, total 95, hidden folder included', () => {
  const t = calculateFolderTotals(state, 'A')
  assert.equal(t.count, 6)
  assert.equal(t.expense, 95)
  assert.equal(state.folders[0].hidden, true)
})

test('opened folder is DIRECT only; recursive is reported separately', () => {
  const t = calculateFolderTotals(state, 'A')
  assert.equal(t.expense, 95) // excludes Inner's 7
  assert.equal(t.recursive.expense, 102)
  assert.equal(t.recursive.count, 7)
  assert.equal(calculateFolderTotals(state, 'B').expense, 7)
})

test('period totals keep income / expense / saving separate (no balance)', () => {
  const p = calculatePeriodTotals(state, {})
  assert.deepEqual(Object.keys(p).sort(), ['count', 'expense', 'income', 'saving'])
  assert.equal(p.income, 50000)
  assert.equal(p.saving, 2500) // not income - expense
  assert.equal(p.expense, 207)
  assert.equal(p.count, 11)
})

test('saving area entries, templates and usage counters are never money', () => {
  const p = calculatePeriodTotals(state, {})
  assert.ok(p.saving === 2500 && p.count === 11)
})

test('date filters use local transactionDate inclusively; unknown dates excluded when filtering', () => {
  const aug = calculatePeriodTotals(state, { fromDate: '2026-08-01', toDate: '2026-08-31' })
  assert.equal(aug.expense, 75 + 20 + 100)
  assert.equal(aug.income, 50000)
  assert.equal(aug.count, 9)
  const day = calculatePeriodTotals(state, { fromDate: '2026-08-31', toDate: '2026-08-31' })
  assert.equal(day.expense, 100)
  assert.equal(calculateSectionTotals(state, 'expense', { fromDate: '2026-09-01' }).count, 1)
})

test('transactionType snapshot decides the bucket in period totals', () => {
  const s = { transactions: [tx({ sectionId: 'expense', transactionType: 'saving', amount: 30 })] }
  assert.equal(calculatePeriodTotals(s, {}).saving, 30)
  assert.equal(calculatePeriodTotals(s, {}).expense, 0)
})

test('invalid amounts are ignored and float dust is rounded', () => {
  const s = {
    transactions: [
      tx({ amount: 0.1 }), tx({ amount: 0.2 }),
      tx({ amount: '50' }), tx({ amount: NaN }), tx({ amount: -4 }),
    ],
  }
  assert.equal(calculatePeriodTotals(s, {}).expense, 0.3)
})

test('empty / missing state is safe', () => {
  assert.deepEqual(calculatePeriodTotals({}, {}), { income: 0, expense: 0, saving: 0, count: 0 })
  assert.deepEqual(calculateSectionTotals(null, 'income'), { sectionId: 'income', total: 0, count: 0 })
  assert.deepEqual(getRecentTransactions({}, 5), [])
})

test('recent transactions: newest first, limited, no mutation', () => {
  const before = state.transactions.map((t) => t.id).join()
  const r = getRecentTransactions(state, 2)
  assert.equal(r.length, 2)
  assert.equal(r[0].transactionDate, '2026-09-01')
  assert.equal(r[1].transactionDate, '2026-08-31')
  assert.equal(state.transactions.map((t) => t.id).join(), before)
  assert.equal(getRecentTransactions(state, 0).length, 0)
})

test('folder breakdown groups by folder, falls back to snapshot name', () => {
  const s = {
    folders: [],
    transactions: [tx({ folderId: 'gone', folderNameSnapshot: 'Old', amount: 5 }), tx({ amount: 9 })],
  }
  const b = calculateFolderBreakdown(s, 'expense')
  assert.deepEqual(b.map((g) => [g.name, g.total, g.count]), [['No folder', 9, 1], ['Old', 5, 1]])
})

test('period ranges are local calendar dates', () => {
  const now = new Date(2026, 1, 15, 23, 59) // 15 Feb 2026 local, late night
  assert.equal(toLocalDateKey(now), '2026-02-15')
  assert.deepEqual(getPeriodRange('today', now), { fromDate: '2026-02-15', toDate: '2026-02-15' })
  assert.deepEqual(getPeriodRange('month', now), { fromDate: '2026-02-01', toDate: '2026-02-28' })
  assert.deepEqual(getPeriodRange('year', now), { fromDate: '2026-01-01', toDate: '2026-12-31' })
  assert.deepEqual(getPeriodRange('all', now), { fromDate: null, toDate: null })
})
