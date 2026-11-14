// Review-pass additions: undo/redo support in records.js, period-scoped totals and
// day / month / year grouping in analytics.js. Run through the same pure functions App.jsx uses.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleData } from '../src/data/sampleData.js'
import { migrateLegacyData } from '../src/data/migrations.js'
import { createTransaction, restoreTransaction, deleteTransaction, getChecklistUsageCount } from '../src/domain/records.js'
import { calculateFolderTotals, groupByPeriod } from '../src/domain/analytics.js'

const base = () => migrateLegacyData(sampleData).state
const c0 = (s) => s.checklists.find((c) => c.id === 'cl-tea')
const rec = (s, amount, day, extra = {}) => {
  const c = c0(s)
  return createTransaction(s, {
    sectionId: c.sectionId, folderId: c.folderId, checklistId: c.id, amount, source: 'checklist',
    now: new Date(`${day}T10:00:00`), ...extra,
  })
}

test('createTransaction keeps a supplied id, otherwise makes one', () => {
  let s = rec(base(), 15, '2026-11-13', { id: 'tx-fixed' })
  assert.equal(s.transactions.at(-1).id, 'tx-fixed')
  s = rec(s, 15, '2026-11-13')
  assert.notEqual(s.transactions.at(-1).id, 'tx-fixed')
  assert.ok(s.transactions.at(-1).id.length > 3)
})

test('delete then restore (undo/redo) brings back the same row, once', () => {
  let s = rec(base(), 15, '2026-11-13', { id: 'tx-a' })
  const row = s.transactions.find((t) => t.id === 'tx-a')
  const before = getChecklistUsageCount(s, 'cl-tea')
  s = deleteTransaction(s, 'tx-a')
  assert.equal(getChecklistUsageCount(s, 'cl-tea'), before - 1)
  s = restoreTransaction(s, row)
  assert.equal(getChecklistUsageCount(s, 'cl-tea'), before)
  assert.deepEqual(s.transactions.find((t) => t.id === 'tx-a'), row)
  // restoring twice must not duplicate
  assert.equal(restoreTransaction(s, row), s)
  assert.throws(() => restoreTransaction(s, {}))
})

test('calculateFolderTotals honours a date range (direct totals of that folder only)', () => {
  let s = base()
  const folderId = c0(s).folderId
  s = rec(s, 15, '2026-11-13')
  s = rec(s, 15, '2026-11-12')
  s = rec(s, 20, '2025-03-01')
  const all = calculateFolderTotals(s, folderId)
  const today = calculateFolderTotals(s, folderId, { fromDate: '2026-11-13', toDate: '2026-11-13' })
  const month = calculateFolderTotals(s, folderId, { fromDate: '2026-11-01', toDate: '2026-11-30' })
  assert.ok(all.expense >= today.expense + 35)
  assert.equal(today.expense, 15)
  assert.equal(month.expense, 30)
  assert.equal(all.expense - month.expense >= 20, true)
})

test('groupByPeriod: day / month / year, newest first, separate totals, correct range ends', () => {
  let s = { ...base(), transactions: [] }
  s = rec(s, 10, '2026-11-13')
  s = rec(s, 5, '2026-11-13')
  s = rec(s, 7, '2026-02-28')
  s = rec(s, 9, '2025-12-31')
  const days = groupByPeriod(s, 'day')
  assert.deepEqual(days.map((d) => d.key), ['2026-11-13', '2026-02-28', '2025-12-31'])
  assert.equal(days[0].count, 2)
  const months = groupByPeriod(s, 'month')
  assert.deepEqual(months.map((d) => d.key), ['2026-11', '2026-02', '2025-12'])
  assert.equal(months[1].fromDate, '2026-02-01')
  assert.equal(months[1].toDate, '2026-02-28')
  const years = groupByPeriod(s, 'year')
  assert.deepEqual(years.map((d) => d.key), ['2026', '2025'])
  assert.equal(years[1].fromDate, '2025-01-01')
  assert.equal(years[1].toDate, '2025-12-31')
  assert.equal(years[0].expense + years[0].income + years[0].saving, 22)
  // only this month
  assert.equal(groupByPeriod(s, 'day', { fromDate: '2026-11-01', toDate: '2026-11-30' }).length, 1)
})
