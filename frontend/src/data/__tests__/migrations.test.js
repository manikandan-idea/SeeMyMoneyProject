import test from 'node:test'
import assert from 'node:assert/strict'
import { migrateLegacyData, normalizeLegacyTimestamp, upgradeStoredState } from '../migrations.js'
import { validateAppState, SCHEMA_VERSION } from '../schema.js'
import { sampleData } from '../sampleData.js'

const NOW = new Date('2026-11-06T08:00:00.000Z')

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const byId = (list, id) => list.find((row) => row.id === id)

test('sample data migrates into a valid normalized AppState', () => {
  const { state, report } = migrateLegacyData(sampleData, { now: NOW })
  assert.deepEqual(validateAppState(state), [])
  assert.equal(state.schemaVersion, SCHEMA_VERSION)
  assert.equal(state.sections.length, 3)

  assert.equal(state.folders.length, 7)
  assert.equal(state.checklists.length, 8)
  // 7 legacy `items` + 2 legacy `others`, each its own row
  assert.equal(state.transactions.length, 9)
  assert.equal(state.savingAreaEntries.length, 0)
  assert.deepEqual(report.counts, { folders: 7, checklists: 8, transactions: 9 })
  assert.deepEqual(report.legacyRowsSeen, { items: 7, others: 2 })
  assert.deepEqual(report.skipped, [])
  assert.deepEqual(report.duplicatesDropped, [])
})

test('folders are flattened with original ids, sections and parent links', () => {
  const { state } = migrateLegacyData(sampleData, { now: NOW })
  assert.equal(byId(state.folders, 'f-business').parentFolderId, null)
  assert.equal(byId(state.folders, 'f-projects').parentFolderId, 'f-business')
  assert.equal(byId(state.folders, 'f-projects').sectionId, 'income')
  assert.equal(byId(state.folders, 'f-daily').sectionId, 'expense')
  assert.equal(byId(state.folders, 'f-goal').sectionId, 'saving')
  const daily = byId(state.folders, 'f-daily')
  assert.equal(daily.usage, 'daily')
  assert.equal(daily.othersEnabled, true)
  assert.equal(byId(state.folders, 'f-business').frequency, 'multiple')
  // parents are emitted before their children
  assert.ok(state.folders.findIndex((f) => f.id === 'f-business') < state.folders.findIndex((f) => f.id === 'f-projects'))
})

test('checklists become independent templates (no counters, no fake rows)', () => {
  const { state } = migrateLegacyData(sampleData, { now: NOW })
  const tea = byId(state.checklists, 'cl-tea')
  assert.deepEqual(tea, {
    id: 'cl-tea',
    sectionId: 'expense',
    folderId: 'f-daily',
    title: 'Tea & snacks',
    defaultAmount: 20,
    transactionType: 'expense',
    frequency: 'daily',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  })
  assert.equal('timesRecorded' in tea, false)
  assert.equal(byId(state.checklists, 'cl-client').frequency, null) // occasional folder
  assert.equal(byId(state.checklists, 'cl-rent').frequency, 'monthly')
  // no transaction was invented from timesRecorded
  assert.equal(state.transactions.filter((t) => t.checklistId !== null).length, 0)
})

test('every legacy item/other becomes its own transaction with preserved data', () => {
  const { state } = migrateLegacyData(sampleData, { now: NOW })
  const logo = byId(state.transactions, 'i-logo')
  assert.deepEqual(logo, {
    id: 'i-logo',
    sectionId: 'income',
    folderId: 'f-projects',
    folderNameSnapshot: 'Projects',
    checklistId: null,
    checklistTitleSnapshot: null,
    description: 'Logo design',
    amount: 5000,
    transactionType: 'income',
    recordedAt: new Date('2026-08-18T14:20:00').toISOString(),
    transactionDate: '2026-08-18',
    source: 'manual',
  })
  const salary = byId(state.transactions, 'i-salary')
  assert.equal(salary.folderId, null) // section-root item
  assert.equal(salary.folderNameSnapshot, null)

  const news = byId(state.transactions, 'o-news')
  assert.equal(news.description, 'Newspaper') // legacy `details`
  assert.equal(news.source, 'other')
  assert.equal(news.amount, 30)
  assert.equal(news.folderId, 'f-daily')
  assert.equal(news.transactionDate, '2026-08-28')
})

test('checklist counters without backing rows are reported, not fabricated', () => {
  const { report } = migrateLegacyData(sampleData, { now: NOW })
  const ids = report.checklistCounterMismatches.map((m) => m.checklistId).sort()
  assert.deepEqual(ids, ['cl-bus', 'cl-tea'])
  const bus = report.checklistCounterMismatches.find((m) => m.checklistId === 'cl-bus')
  assert.equal(bus.legacyTimesRecorded, 1)
  assert.equal(bus.linkedTransactionRows, 0)
  assert.equal(bus.sameTitleRowsInFolder, 1)
})

test('migration does not settle or touch period folders', () => {
  const { state } = migrateLegacyData(sampleData, { now: NOW })
  // stale daily/monthly period keys are kept exactly as they were
  assert.equal(byId(state.folders, 'f-daily').periodKey, '2026-08-28')
  assert.equal(byId(state.folders, 'f-home').periodKey, '2026-07')
  assert.equal(byId(state.folders, 'f-goal').periodKey, '2025')
  // records that sat inside the daily folder stay attached to it
  assert.equal(byId(state.transactions, 'i-bus').folderId, 'f-daily')
})

test('migration is pure and idempotent: no input mutation, identical output', () => {
  const frozen = deepFreeze(structuredClone(sampleData))
  const first = migrateLegacyData(frozen, { now: NOW })
  const second = migrateLegacyData(frozen, { now: NOW })
  assert.deepEqual(first, second)
  assert.deepEqual(frozen, sampleData)
})

test('genuinely duplicated transaction ids collapse; colliding different rows are kept', () => {
  const legacy = {
    income: {
      folders: [],
      items: [
        { id: 'x', description: 'Salary', amount: 100, recordedAt: '2026-08-01T09:00:00' },
        { id: 'x', description: 'Salary', amount: 100, recordedAt: '2026-08-01T09:00:00' }, // same record twice
        { id: 'y', description: 'Gift', amount: 50, recordedAt: '2026-08-02T09:00:00' },
        { id: 'y', description: 'Gift', amount: 75, recordedAt: '2026-08-03T09:00:00' }, // different record, same id
      ],
    },
  }
  const { state, report } = migrateLegacyData(legacy, { now: NOW })
  assert.deepEqual(state.transactions.map((t) => t.id), ['x', 'y', 'y~dup2'])
  assert.equal(state.transactions.find((t) => t.id === 'y~dup2').amount, 75)
  assert.equal(report.duplicatesDropped.length, 1)
  assert.equal(report.idsRenamed.length, 1)
  assert.deepEqual(validateAppState(state), [])
})

test('rows that cannot be migrated safely are skipped and kept in the report', () => {
  const legacy = {
    expense: {
      folders: [],
      items: [
        { id: 'a', description: 'Zero', amount: 0, recordedAt: '2026-08-01T09:00:00' },
        { id: 'b', description: 'Text amount', amount: '40', recordedAt: '2026-08-01T09:00:00' },
        { id: 'c', description: 'No time', amount: 10 },
        { id: 'd', description: 'Bad time', amount: 10, recordedAt: 'yesterday' },
        { id: 'e', description: 'Fine', amount: 10, recordedAt: '2026-08-01T09:00:00' },
      ],
    },
  }
  const { state, report } = migrateLegacyData(legacy, { now: NOW })
  assert.deepEqual(state.transactions.map((t) => t.id), ['e'])
  assert.deepEqual(report.skipped.map((s) => s.id), ['a', 'b', 'c', 'd'])
  assert.equal(report.skipped[1].original.amount, '40') // original preserved, not converted
  // nothing is unaccounted for
  const seen = report.legacyRowsSeen.items + report.legacyRowsSeen.others
  assert.equal(seen, state.transactions.length + report.skipped.length + report.duplicatesDropped.length)
})

test('timestamps: zone-less is read as local time; date shown to the user is kept', () => {
  const t = normalizeLegacyTimestamp('2026-08-18T23:50:00')
  assert.equal(t.transactionDate, '2026-08-18')
  assert.equal(t.recordedAt, new Date(2026, 7, 18, 23, 50).toISOString())
  const z = normalizeLegacyTimestamp('2026-08-18T10:00:00Z')
  assert.equal(z.recordedAt, '2026-08-18T10:00:00.000Z')
  const d = normalizeLegacyTimestamp('2026-08-18')
  assert.equal(d.approximated, true)
  assert.equal(d.transactionDate, '2026-08-18')
  assert.equal(normalizeLegacyTimestamp('2026-02-30T10:00:00'), null)
  assert.equal(normalizeLegacyTimestamp(''), null)
  assert.equal(normalizeLegacyTimestamp(42), null)
})

test('hidden folders stay hidden, empty/odd input does not throw', () => {
  const legacy = {
    saving: { folders: [{ id: 'h', name: 'Old', usage: 'weird', hidden: true, checklist: [], items: [], others: [], folders: [] }], items: [] },
    bogus: { folders: [], items: [] },
  }
  const { state, report } = migrateLegacyData(legacy, { now: NOW })
  assert.equal(state.folders[0].hidden, true)
  assert.equal(state.folders[0].usage, null)
  assert.deepEqual(report.ignoredSections, ['bogus'])
  assert.deepEqual(migrateLegacyData(undefined, { now: NOW }).state.folders, [])
})

test('upgradeStoredState is a no-op at the current version and refuses unknown paths', () => {
  const state = migrateLegacyData(sampleData, { now: NOW }).state
  assert.deepEqual(upgradeStoredState(state, SCHEMA_VERSION), state)
  assert.throws(() => upgradeStoredState(state, 0), /No migration path/)
})
