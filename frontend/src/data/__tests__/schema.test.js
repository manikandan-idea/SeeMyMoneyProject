import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createId,
  createEmptyState,
  localDateKey,
  currentPeriodKey,
  isoToLocalDateKey,
  validateAppState,
  assertValidAppState,
  AppStateValidationError,
  stableStringify,
  toStoredRow,
  fromStoredRow,
  isValidDateKey,
} from '../schema.js'

const NOW = '2026-08-18T10:00:00.000Z'

const folder = (over = {}) => ({
  id: 'f1',
  sectionId: 'expense',
  parentFolderId: null,
  name: 'Daily',
  usage: 'daily',
  frequency: null,
  othersEnabled: true,
  hidden: false,
  periodKey: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})
const checklist = (over = {}) => ({
  id: 'c1',
  sectionId: 'expense',
  folderId: 'f1',
  title: 'Tea',
  defaultAmount: 15,
  transactionType: 'expense',
  frequency: 'daily',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})
const txn = (over = {}) => ({
  id: 't1',
  sectionId: 'expense',
  folderId: 'f1',
  folderNameSnapshot: 'Daily',
  checklistId: 'c1',
  checklistTitleSnapshot: 'Tea',
  description: 'Tea',
  amount: 15,
  transactionType: 'expense',
  recordedAt: NOW,
  transactionDate: '2026-08-18',
  source: 'checklist',
  ...over,
})
const entry = (over = {}) => ({
  id: 's1',
  sectionId: 'expense',
  ownerFolderId: 'f1',
  sourceType: 'checklist',
  sourceId: 'c1',
  titleSnapshot: 'Tea',
  addedAt: NOW,
  ...over,
})
const stateWith = (over = {}) => ({ ...createEmptyState(), ...over })

test('createId returns unique non-empty strings, with and without crypto.randomUUID', () => {
  const ids = new Set(Array.from({ length: 500 }, () => createId()))
  assert.equal(ids.size, 500)

  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (a) => crypto_fill(a) }, configurable: true })
    const viaRandomValues = createId()
    assert.match(viaRandomValues, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    const a = createId()
    const b = createId()
    assert.ok(a && b && a !== b)
  } finally {
    Object.defineProperty(globalThis, 'crypto', original)
  }
})

function crypto_fill(array) {
  for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256)
  return array
}

test('localDateKey uses LOCAL calendar parts, not the UTC date', () => {
  const d = new Date(2026, 0, 5, 23, 59) // 5 Jan 2026, 23:59 local
  assert.equal(localDateKey(d), '2026-01-05')
  assert.equal(isoToLocalDateKey(d.toISOString()), '2026-01-05')
  assert.equal(isoToLocalDateKey('not a date'), null)
})

test('currentPeriodKey formats daily / monthly / yearly', () => {
  const d = new Date(2026, 7, 9, 12)
  assert.equal(currentPeriodKey('daily', d), '2026-08-09')
  assert.equal(currentPeriodKey('monthly', d), '2026-08')
  assert.equal(currentPeriodKey('yearly', d), '2026')
  assert.equal(currentPeriodKey('occasional', d), '2026-08-09')
})

test('isValidDateKey rejects impossible dates', () => {
  assert.equal(isValidDateKey('2026-02-29'), false)
  assert.equal(isValidDateKey('2028-02-29'), true)
  assert.equal(isValidDateKey('2026-8-1'), false)
})

test('an empty and a fully populated AppState are valid', () => {
  assert.deepEqual(validateAppState(createEmptyState()), [])
  const full = stateWith({
    folders: [folder(), folder({ id: 'f2', parentFolderId: 'f1' })],
    checklists: [checklist()],
    transactions: [txn(), txn({ id: 't2', folderId: null, folderNameSnapshot: null, checklistId: null, checklistTitleSnapshot: null, source: 'manual' })],
    savingAreaEntries: [entry()],
  })
  assert.deepEqual(validateAppState(full), [])
})

test('a transaction whose checklist/folder no longer exists is still valid (no foreign keys)', () => {
  const state = stateWith({ transactions: [txn({ folderId: 'gone', checklistId: 'gone-too' })] })
  assert.deepEqual(validateAppState(state), [])
})

test('validation rejects duplicate ids, bad amounts, bad enums and bad dates', () => {
  const bad = stateWith({
    folders: [folder(), folder()],
    checklists: [checklist({ defaultAmount: 0 }), checklist({ id: 'c2', defaultAmount: '15' })],
    transactions: [
      txn({ amount: -1 }),
      txn({ id: 't2', amount: Number.NaN }),
      txn({ id: 't3', transactionDate: '2026-13-40' }),
      txn({ id: 't4', source: 'telepathy' }),
      txn({ id: 't5', sectionId: 'bonus' }),
      txn({ id: 't6', folderId: undefined }),
    ],
  })
  const problems = validateAppState(bad).join('\n')
  assert.match(problems, /duplicate id/)
  assert.match(problems, /defaultAmount must be a positive number/)
  assert.match(problems, /amount must be a positive number/)
  assert.match(problems, /transactionDate/)
  assert.match(problems, /source is invalid/)
  assert.match(problems, /invalid sectionId/)
  assert.match(problems, /folderId must be a string or null/)
  assert.throws(() => assertValidAppState(bad), AppStateValidationError)
})

test('validation rejects missing parents, cross-section parents and parent loops', () => {
  assert.match(validateAppState(stateWith({ folders: [folder({ parentFolderId: 'nope' })] })).join(), /missing parent/)
  assert.match(
    validateAppState(stateWith({ folders: [folder(), folder({ id: 'f2', sectionId: 'income', parentFolderId: 'f1' })] })).join(),
    /different section/,
  )
  const loop = stateWith({
    folders: [folder({ id: 'a', parentFolderId: 'b' }), folder({ id: 'b', parentFolderId: 'a' })],
  })
  assert.match(validateAppState(loop).join(), /parent loop/)
})

test('validation rejects non-array stores and a wrong schemaVersion', () => {
  assert.match(validateAppState({ ...createEmptyState(), transactions: null }).join(), /transactions must be an array/)
  assert.match(validateAppState({ ...createEmptyState(), schemaVersion: 2 }).join(), /schemaVersion/)
  assert.deepEqual(validateAppState(null), ['AppState must be an object.'])
})

test('stableStringify ignores key order', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 1, c: 2 } }), stableStringify({ a: { c: 2, d: 1 }, b: 1 }))
})

test('stored rows carry internal order/hidden fields that are stripped on the way back', () => {
  const f = folder({ hidden: true })
  const row = toStoredRow('folders', f, 7)
  assert.equal(row.__order, 7)
  assert.equal(row.__hidden, 1)
  assert.deepEqual(fromStoredRow(row), f)
  assert.equal(toStoredRow('transactions', txn(), 0).__hidden, undefined)
  assert.equal(toStoredRow('folders', folder(), 0).__hidden, 0)
})
