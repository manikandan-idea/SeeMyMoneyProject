import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppStoreController, createStorage, StorageError } from '../storage.js'
import { createFakeIndexedDB } from './fakeIndexedDB.js'
import { createEmptyState } from '../schema.js'

const NOW = '2026-11-06T08:00:00.000Z'
const txn = (id, amount = 10) => ({
  id,
  sectionId: 'expense',
  folderId: null,
  folderNameSnapshot: null,
  checklistId: null,
  checklistTitleSnapshot: null,
  description: id,
  amount,
  transactionType: 'expense',
  recordedAt: NOW,
  transactionDate: '2026-11-06',
  source: 'manual',
})
const addTxn = (id, amount) => (s) => ({ ...s, transactions: [...s.transactions, txn(id, amount)] })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}
const idsOf = (c) => c.getSnapshot().state.transactions.map((t) => t.id)

function makeController(overrides = {}) {
  const saved = []
  const controller = createAppStoreController({
    load: async () => createEmptyState(),
    save: async (s) => void saved.push(s),
    ...overrides,
  })
  return { controller, saved }
}

test('starts as loading with no state, then becomes ready', async () => {
  const { controller } = makeController()
  assert.deepEqual(controller.getSnapshot(), { state: null, status: 'loading', error: null })
  await controller.start()
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.ok(controller.getSnapshot().state)
})

test('two rapid commits are serialized: neither update is lost', async () => {
  const { controller, saved } = makeController()
  await controller.start()
  await Promise.all([controller.commit(addTxn('a')), controller.commit(addTxn('b')), controller.commit(addTxn('c'))])
  assert.deepEqual(idsOf(controller), ['a', 'b', 'c'])
  assert.equal(saved.length, 3)
  assert.deepEqual(saved[2].transactions.map((t) => t.id), ['a', 'b', 'c'])
})

test('visible state changes only after the save succeeds', async () => {
  const gate = deferred()
  const { controller } = makeController({ save: () => gate.promise })
  await controller.start()
  const pending = controller.commit(addTxn('a'))
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(controller.getSnapshot().status, 'saving')
  assert.deepEqual(idsOf(controller), []) // not shown as saved yet
  gate.resolve()
  await pending
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.deepEqual(idsOf(controller), ['a'])
})

test('a failed save keeps the last good state, exposes the error, and later commits still work', async () => {
  let fail = true
  const { controller } = makeController({
    save: async () => {
      if (fail) throw new StorageError('STORAGE_FAILED', 'disk full')
    },
  })
  await controller.start()
  await controller.commit(addTxn('ok1')).catch(() => {}) // fails (fail = true)
  assert.equal(controller.getSnapshot().status, 'error')
  assert.equal(controller.getSnapshot().error.message, 'disk full')
  assert.deepEqual(idsOf(controller), [])

  fail = false
  await controller.commit(addTxn('ok2'))
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().error, null)
  assert.deepEqual(idsOf(controller), ['ok2'])
})

test('commit rejects on failure and the queue is not poisoned for queued commits', async () => {
  let calls = 0
  const { controller } = makeController({
    save: async () => {
      calls += 1
      if (calls === 1) throw new Error('first fails')
    },
  })
  await controller.start()
  const first = controller.commit(addTxn('a'))
  const second = controller.commit(addTxn('b'))
  await assert.rejects(first, /first fails/)
  await second
  assert.deepEqual(idsOf(controller), ['b']) // 'a' was never persisted, so it is not applied
})

test('an updater that throws, or yields invalid data, saves nothing', async () => {
  const { controller, saved } = makeController()
  await controller.start()
  await assert.rejects(controller.commit(() => { throw new Error('domain rule broken') }), /domain rule/)
  assert.equal(controller.getSnapshot().status, 'error')
  await assert.rejects(controller.commit((s) => ({ ...s, transactions: [txn('bad', -1)] })), /Invalid app data/)
  assert.equal(saved.length, 0)
  assert.deepEqual(idsOf(controller), [])
})

test('an updater returning the same state skips the write', async () => {
  const { controller, saved } = makeController()
  await controller.start()
  await controller.commit((s) => s)
  assert.equal(saved.length, 0)
  assert.equal(controller.getSnapshot().status, 'ready')
})

test('commit before a successful load is refused; reload recovers', async () => {
  let ok = false
  const { controller } = makeController({
    load: async () => {
      if (!ok) throw new StorageError('OPEN_FAILED', 'cannot open')
      return createEmptyState()
    },
  })
  await controller.start()
  assert.equal(controller.getSnapshot().status, 'error')
  assert.equal(controller.getSnapshot().state, null)
  await assert.rejects(controller.commit(addTxn('a')), (e) => e.code === 'NOT_READY')
  ok = true
  await controller.reload()
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.equal(controller.getSnapshot().error, null)
})

test('a failed reload keeps the existing state', async () => {
  let fail = false
  const { controller } = makeController({
    load: async () => {
      if (fail) throw new Error('boom')
      return createEmptyState()
    },
  })
  await controller.start()
  await controller.commit(addTxn('a'))
  fail = true
  await assert.rejects(controller.reload(), /boom/)
  assert.deepEqual(idsOf(controller), ['a'])
  assert.equal(controller.getSnapshot().status, 'error')
  controller.dismissError()
  assert.equal(controller.getSnapshot().status, 'ready')
})

test('subscribers are notified and external changes trigger a reload', async () => {
  let notify = () => {}
  let version = 0
  const { controller } = makeController({
    load: async () => ({ ...createEmptyState(), transactions: version ? [txn('external')] : [] }),
    subscribeExternal: (cb) => {
      notify = cb
      return () => {}
    },
  })
  let calls = 0
  controller.subscribe(() => (calls += 1))
  await controller.start()
  assert.ok(calls >= 2)
  version = 1
  notify()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(idsOf(controller), ['external'])
})

test('end to end with real storage: rapid commits survive a restart', async () => {
  const idb = createFakeIndexedDB()
  const storage = createStorage({ indexedDB: idb, broadcast: false })
  const controller = createAppStoreController({ load: storage.loadAppState, save: storage.saveAppState })
  await controller.start()
  const before = controller.getSnapshot().state.transactions.length
  await Promise.all([controller.commit(addTxn('r1')), controller.commit(addTxn('r2'))])

  const restarted = createStorage({ indexedDB: idb, broadcast: false })
  const state = await restarted.loadAppState()
  assert.equal(state.transactions.length, before + 2)
  assert.deepEqual(state.transactions.slice(-2).map((t) => t.id), ['r1', 'r2'])
})
