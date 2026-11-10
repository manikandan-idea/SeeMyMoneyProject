import test from 'node:test'
import assert from 'node:assert/strict'
import { createStorage, StorageError } from '../storage.js'
import { createFakeIndexedDB } from './fakeIndexedDB.js'
import { AppStateValidationError, createEmptyState } from '../schema.js'

const NOW = '2026-11-06T08:00:00.000Z'
const open = (idb, extra = {}) => createStorage({ indexedDB: idb, broadcast: false, ...extra })

const txn = (id, over = {}) => ({
  id,
  sectionId: 'expense',
  folderId: 'f-daily',
  folderNameSnapshot: 'Daily Tea & Auto',
  checklistId: 'cl-tea',
  checklistTitleSnapshot: 'Tea',
  description: 'Tea',
  amount: 15,
  transactionType: 'expense',
  recordedAt: NOW,
  transactionDate: '2026-11-06',
  source: 'checklist',
  ...over,
})

const dbOf = (idb) => idb.databases.get('see-my-money')
const rows = (idb, store) => [...dbOf(idb).data.get(store).values()]

test('first launch creates the stores and imports the sample data exactly once', async () => {
  const idb = createFakeIndexedDB()
  const state = await open(idb).loadAppState()
  assert.equal(state.folders.length, 7)
  assert.equal(state.checklists.length, 8)
  assert.equal(state.transactions.length, 9)
  assert.deepEqual([...dbOf(idb).defs.keys()].sort(), ['checklists', 'folders', 'meta', 'savingAreaEntries', 'transactions'])
  assert.equal(dbOf(idb).version, 1)

  const marker = rows(idb, 'meta').find((r) => r.key === 'bootstrap')
  assert.equal(marker.source, 'legacy-sample-data')
  assert.equal(marker.report.counts.transactions, 9)
  assert.equal(rows(idb, 'meta').find((r) => r.key === 'schema').schemaVersion, 1)

  // internal fields never leak into AppState
  assert.equal(Object.keys(state.folders[0]).some((k) => k.startsWith('__')), false)
})

test('later launches never re-import or overwrite user data', async () => {
  const idb = createFakeIndexedDB()
  const first = open(idb)
  const loaded = await first.loadAppState()
  const edited = {
    ...loaded,
    transactions: [...loaded.transactions, txn('t-new')],
    folders: loaded.folders.filter((f) => f.id !== 'f-goal'),
  }
  await first.saveAppState(edited)

  const restarted = await open(idb).loadAppState() // "app restart": brand-new instance
  assert.deepEqual(restarted, edited)
  assert.ok(restarted.transactions.some((t) => t.id === 't-new'))
  assert.equal(restarted.folders.some((f) => f.id === 'f-goal'), false)
})

test('deleting everything does not bring the sample data back', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  await storage.saveAppState({ ...createEmptyState(), sections: loaded.sections })
  const again = await open(idb).loadAppState()
  assert.equal(again.folders.length + again.transactions.length + again.checklists.length, 0)
})

test('existing data without a bootstrap marker is never overwritten by the import', async () => {
  const idb = createFakeIndexedDB()
  const probe = open(idb)
  await probe.close()
  // create the stores, then write a user row directly and make sure no marker exists
  const loader = open(idb)
  await loader.loadAppState()
  const db = dbOf(idb)
  db.data.get('meta').delete('bootstrap')
  for (const store of ['folders', 'checklists', 'transactions']) db.data.get(store).clear()
  db.data.get('transactions').set('mine', { ...txn('mine'), __order: 0 })

  const state = await open(idb).loadAppState()
  assert.deepEqual(state.transactions.map((t) => t.id), ['mine'])
  assert.equal(state.folders.length, 0)
  assert.equal(rows(idb, 'meta').find((r) => r.key === 'bootstrap').source, 'existing-data')
})

test('a failed first-run import is fully rolled back and retried next launch', async () => {
  const idb = createFakeIndexedDB()
  idb.hooks.beforeWrite = (store, op, value) => {
    if (store === 'transactions' && value.id === 'i-salary') throw new Error('disk full (simulated)')
  }
  await assert.rejects(() => open(idb).loadAppState(), StorageError)
  for (const store of ['folders', 'checklists', 'transactions', 'savingAreaEntries', 'meta']) {
    assert.equal(rows(idb, store).length, 0, `${store} must be empty after the aborted import`)
  }
  idb.hooks.beforeWrite = null
  const state = await open(idb).loadAppState()
  assert.equal(state.transactions.length, 9)
})

test('save is atomic: one failing write rolls back every store', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const before = structuredClone(rows(idb, 'transactions'))

  idb.hooks.beforeWrite = (store, op, value) => {
    if (store === 'transactions' && value.id === 't-bad') throw new Error('simulated failure')
  }
  const next = {
    ...loaded,
    folders: loaded.folders.map((f) => (f.id === 'f-home' ? { ...f, name: 'Renamed' } : f)),
    transactions: [...loaded.transactions, txn('t-ok'), txn('t-bad')],
  }
  await assert.rejects(() => storage.saveAppState(next), StorageError)
  assert.deepEqual(rows(idb, 'transactions'), before)
  assert.equal(rows(idb, 'folders').find((f) => f.id === 'f-home').name, 'Home')

  // the instance still works afterwards and its baseline was not advanced by the failed save
  idb.hooks.beforeWrite = null
  await storage.saveAppState(next)
  assert.ok(rows(idb, 'transactions').some((t) => t.id === 't-bad'))
})

test('invalid state is rejected before touching the database', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const before = structuredClone(rows(idb, 'transactions'))
  await assert.rejects(
    () => storage.saveAppState({ ...loaded, transactions: [...loaded.transactions, txn('t-x', { amount: -5 })] }),
    AppStateValidationError,
  )
  assert.deepEqual(rows(idb, 'transactions'), before)
})

test('list order is preserved across save/load', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const reversed = { ...loaded, transactions: [txn('zzz'), txn('aaa'), ...loaded.transactions].reverse() }
  await storage.saveAppState(reversed)
  const again = await open(idb).loadAppState()
  assert.deepEqual(again.transactions.map((t) => t.id), reversed.transactions.map((t) => t.id))
})

test('six separate rows for six uses (never a count field); deleting one deletes only that row', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const six = [...Array(5)].map((_, i) => txn(`tea-${i}`)).concat(txn('tea-5', { amount: 20, source: 'checklist-other' }))
  await storage.saveAppState({ ...loaded, transactions: [...loaded.transactions, ...six] })
  const teaRows = rows(idb, 'transactions').filter((t) => t.checklistId === 'cl-tea')
  assert.equal(teaRows.length, 6)
  assert.equal(teaRows.some((t) => 'count' in t), false)

  const afterDelete = (await storage.loadAppState())
  await storage.saveAppState({ ...afterDelete, transactions: afterDelete.transactions.filter((t) => t.id !== 'tea-2') })
  const remaining = rows(idb, 'transactions').filter((t) => t.checklistId === 'cl-tea')
  assert.deepEqual(remaining.map((t) => t.id).sort(), ['tea-0', 'tea-1', 'tea-3', 'tea-4', 'tea-5'])
})

test('removing a checklist template leaves its transactions untouched in the store', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const withTea = {
    ...loaded,
    checklists: [...loaded.checklists, { ...loaded.checklists[0], id: 'cl-tea2', title: 'Tea', defaultAmount: 15 }],
    transactions: [...loaded.transactions, txn('t1', { checklistId: 'cl-tea2' }), txn('t2', { checklistId: 'cl-tea2' })],
  }
  await storage.saveAppState(withTea)
  await storage.saveAppState({ ...withTea, checklists: withTea.checklists.filter((c) => c.id !== 'cl-tea2') })
  assert.equal(rows(idb, 'checklists').some((c) => c.id === 'cl-tea2'), false)
  assert.equal(rows(idb, 'transactions').filter((t) => t.checklistId === 'cl-tea2').length, 2)
})

test('indexes: hidden works through a numeric key; null/boolean keys are not indexable', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  const hidden = { ...loaded, folders: loaded.folders.map((f) => (f.id === 'f-home' ? { ...f, hidden: true } : f)) }
  await storage.saveAppState(hidden)

  const db = dbOf(idb)
  const tx = db.transaction(['folders', 'transactions'], 'readonly')
  const hiddenRows = await new Promise((resolve) => {
    const req = tx.objectStore('folders').index('hidden').getAll(1)
    req.onsuccess = () => resolve(req.result)
  })
  assert.deepEqual(hiddenRows.map((f) => f.id), ['f-home'])
  const byParent = await new Promise((resolve) => {
    const req = tx.objectStore('folders').index('parentFolderId').getAll()
    req.onsuccess = () => resolve(req.result)
  })
  assert.deepEqual(byParent.map((f) => f.id), ['f-projects']) // top-level (null parent) rows are not in the index
  const byDate = await new Promise((resolve) => {
    const req = tx.objectStore('transactions').index('transactionDate').getAll('2026-08-28')
    req.onsuccess = () => resolve(req.result)
  })
  assert.equal(byDate.length, 3)
  for (const store of ['folders', 'checklists', 'transactions', 'savingAreaEntries']) {
    assert.ok(dbOf(idb).defs.get(store).indexes.size >= 2)
  }
})

test('a stale second tab cannot delete or lose rows another tab saved', async () => {
  const idb = createFakeIndexedDB()
  const tabA = open(idb)
  const tabB = open(idb)
  const a0 = await tabA.loadAppState()
  const b0 = await tabB.loadAppState()

  await tabA.saveAppState({ ...a0, transactions: [...a0.transactions, txn('from-a')] })
  await tabB.saveAppState({ ...b0, transactions: [...b0.transactions, txn('from-b')] }) // B never saw from-a

  const ids = rows(idb, 'transactions').map((t) => t.id)
  assert.ok(ids.includes('from-a'), 'tab A row must survive')
  assert.ok(ids.includes('from-b'))

  // B explicitly deleting a row it knew about still works
  const b1 = await tabB.loadAppState()
  await tabB.saveAppState({ ...b1, transactions: b1.transactions.filter((t) => t.id !== 'i-logo') })
  assert.equal(rows(idb, 'transactions').some((t) => t.id === 'i-logo'), false)
  assert.ok(rows(idb, 'transactions').some((t) => t.id === 'from-a'))
})

test('saving before any load still blocks a later sample import', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  await storage.saveAppState({ ...createEmptyState(), transactions: [txn('only')] })
  const state = await open(idb).loadAppState()
  assert.deepEqual(state.transactions.map((t) => t.id), ['only'])
  assert.equal(state.folders.length, 0)
})

test('data written by a newer schema is refused, not overwritten', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const loaded = await storage.loadAppState()
  dbOf(idb).data.get('meta').set('schema', { key: 'schema', schemaVersion: 99 })
  await assert.rejects(() => open(idb).loadAppState(), (e) => e.code === 'NEWER_SCHEMA')
  await assert.rejects(() => storage.saveAppState(loaded), (e) => e.code === 'NEWER_SCHEMA')
})

test('missing IndexedDB gives a clear error', async () => {
  const storage = createStorage({ indexedDB: null, broadcast: false })
  await assert.rejects(() => storage.loadAppState(), (e) => e.code === 'IDB_UNAVAILABLE')
})

test('concurrent saves on one instance are serialized and both persist', async () => {
  const idb = createFakeIndexedDB()
  const storage = open(idb)
  const s0 = await storage.loadAppState()
  const s1 = { ...s0, transactions: [...s0.transactions, txn('one')] }
  const s2 = { ...s1, transactions: [...s1.transactions, txn('two')] }
  await Promise.all([storage.saveAppState(s1), storage.saveAppState(s2)])
  const ids = rows(idb, 'transactions').map((t) => t.id)
  assert.ok(ids.includes('one') && ids.includes('two'))
})
