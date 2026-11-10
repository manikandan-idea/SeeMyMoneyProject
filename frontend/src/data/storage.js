// See My Money — IndexedDB persistence.
//
// This is the ONLY file that talks to IndexedDB. Exports:
//   loadAppState(), saveAppState(nextState)      — the contract API
//   createStorage(options)                       — same API on an injectable
//                                                  IndexedDB (used by the tests)
//   createAppStoreController(...)                — framework-free store used by
//                                                  useAppStore.jsx (serialized commits)
//   StorageError                                 — every storage failure
//
// Rules this file enforces:
//   * one atomic readwrite transaction over all entity stores per save;
//   * "saved" is only reported after the transaction's `complete` event;
//   * saves only write what THIS tab changed (diff against what it last loaded /
//     saved) so a stale second tab cannot delete or overwrite another tab's rows;
//   * sample data is imported at most once, ever (meta.bootstrap marker).

import {
  DB_NAME,
  DB_VERSION,
  SCHEMA_VERSION,
  STORE,
  ENTITY_STORES,
  STORE_DEFINITIONS,
  META_KEYS,
  SECTIONS,
  assertValidAppState,
  fromStoredRow,
  toStoredRow,
  stableStringify,
} from './schema.js'
import { migrateLegacyData, upgradeStoredState } from './migrations.js'
import { sampleData } from './sampleData.js'

const ALL_STORES = [...ENTITY_STORES, STORE.META]
const BROADCAST_NAME = 'see-my-money-data'

export class StorageError extends Error {
  constructor(code, message, cause) {
    super(message)
    this.name = 'StorageError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

function wrapError(error, fallbackCode = 'STORAGE_FAILED') {
  if (error instanceof StorageError) return error
  if (error && error.name === 'AppStateValidationError') return error
  const name = error && error.name
  if (name === 'QuotaExceededError') {
    return new StorageError('QUOTA_EXCEEDED', 'The device is out of storage space. Nothing was saved.', error)
  }
  const detail = error && error.message ? ` (${error.message})` : ''
  return new StorageError(fallbackCode, `Could not access local storage${detail}.`, error)
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

// Run `work(tx)` inside one transaction. Resolves with work's result only after the
// transaction has COMMITTED (`complete`). If work throws, or the transaction aborts,
// nothing is written and the promise rejects.
function runTransaction(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    let tx
    try {
      tx = db.transaction(storeNames, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined)
    } catch (error) {
      reject(wrapError(error))
      return
    }
    let result
    let failure = null
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(failure ?? wrapError(tx.error ?? new Error('Transaction aborted')))
    tx.onerror = () => {} // the abort event that follows carries the failure
    Promise.resolve()
      .then(() => work(tx))
      .then(
        (value) => {
          result = value
        },
        (error) => {
          failure = error instanceof StorageError || error?.name === 'AppStateValidationError' ? error : wrapError(error)
          try {
            tx.abort()
          } catch {
            // already finished
          }
        },
      )
  })
}

function upgradeDatabase(db, transaction) {
  for (const [name, definition] of Object.entries(STORE_DEFINITIONS)) {
    const store = db.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath: definition.keyPath })
    for (const index of definition.indexes) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, { unique: false })
      }
    }
  }
}

const emptyBaseline = () => Object.fromEntries(ENTITY_STORES.map((name) => [name, new Map()]))

// ------------------------------------------------------------------ storage

export function createStorage({
  indexedDB: idbFactory = globalThis.indexedDB,
  getLegacyData = () => sampleData,
  now = () => new Date(),
  broadcast = true,
} = {}) {
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  let dbPromise = null
  let baseline = null // per store: Map(id -> JSON of the row as last loaded/saved by this instance)
  let queue = Promise.resolve()
  let postChannel = null
  const listenChannels = new Set()

  // load/save never overlap inside one instance.
  function serial(task) {
    const result = queue.then(task)
    queue = result.catch(() => {})
    return result
  }

  function openDatabase() {
    if (dbPromise) return dbPromise
    if (!idbFactory) {
      return Promise.reject(new StorageError('IDB_UNAVAILABLE', 'This browser does not provide IndexedDB, so data cannot be stored.'))
    }
    dbPromise = new Promise((resolve, reject) => {
      let req
      try {
        req = idbFactory.open(DB_NAME, DB_VERSION)
      } catch (error) {
        reject(wrapError(error, 'OPEN_FAILED'))
        return
      }
      req.onupgradeneeded = () => {
        try {
          upgradeDatabase(req.result, req.transaction)
        } catch (error) {
          try {
            req.transaction.abort()
          } catch {
            // ignore
          }
          reject(wrapError(error, 'UPGRADE_FAILED'))
        }
      }
      req.onsuccess = () => {
        const db = req.result
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        db.onclose = () => {
          dbPromise = null
        }
        resolve(db)
      }
      req.onerror = () => reject(wrapError(req.error, 'OPEN_FAILED'))
    })
    dbPromise.catch(() => {
      dbPromise = null // allow a later retry
    })
    return dbPromise
  }

  function assertSupportedSchema(schemaMeta) {
    if (schemaMeta && schemaMeta.schemaVersion > SCHEMA_VERSION) {
      throw new StorageError(
        'NEWER_SCHEMA',
        'This data was saved by a newer version of See My Money. Update the app; nothing was changed.',
      )
    }
  }

  // First-run import of the legacy sample data, in ONE atomic transaction, guarded
  // by meta.bootstrap. Re-checked inside the transaction so two tabs cannot both import.
  async function ensureBootstrapped(db) {
    const existing = await runTransaction(db, [STORE.META], 'readonly', (tx) =>
      request(tx.objectStore(STORE.META).get(META_KEYS.BOOTSTRAP)),
    )
    if (existing) return

    await runTransaction(db, ALL_STORES, 'readwrite', async (tx) => {
      const meta = tx.objectStore(STORE.META)
      if (await request(meta.get(META_KEYS.BOOTSTRAP))) return // another tab finished first
      const schemaMeta = await request(meta.get(META_KEYS.SCHEMA))
      assertSupportedSchema(schemaMeta)
      const counts = await Promise.all(ENTITY_STORES.map((name) => request(tx.objectStore(name).count())))
      const at = now().toISOString()

      if (counts.every((count) => count === 0)) {
        const { state, report } = migrateLegacyData(getLegacyData(), { now: now() })
        assertValidAppState(state) // never write an inconsistent import
        for (const name of ENTITY_STORES) {
          const store = tx.objectStore(name)
          state[name].forEach((record, index) => store.put(toStoredRow(name, record, index)))
        }
        meta.put({ key: META_KEYS.BOOTSTRAP, completedAt: at, source: 'legacy-sample-data', schemaVersion: SCHEMA_VERSION, report })
      } else {
        // Data already exists (e.g. written before the marker existed): never import over it.
        meta.put({ key: META_KEYS.BOOTSTRAP, completedAt: at, source: 'existing-data', schemaVersion: SCHEMA_VERSION })
      }
      if (!schemaMeta) meta.put({ key: META_KEYS.SCHEMA, schemaVersion: SCHEMA_VERSION, updatedAt: at })
    })
  }

  async function readEverything(db) {
    return runTransaction(db, ALL_STORES, 'readonly', async (tx) => {
      const lists = await Promise.all(ENTITY_STORES.map((name) => request(tx.objectStore(name).getAll())))
      const schemaMeta = await request(tx.objectStore(STORE.META).get(META_KEYS.SCHEMA))
      return { rows: Object.fromEntries(ENTITY_STORES.map((name, i) => [name, lists[i]])), schemaMeta }
    })
  }

  function loadAppStateNow() {
    return serial(async () => {
      try {
        const db = await openDatabase()
        await ensureBootstrapped(db)
        const { rows, schemaMeta } = await readEverything(db)
        assertSupportedSchema(schemaMeta)

        const nextBaseline = emptyBaseline()
        let state = { schemaVersion: SCHEMA_VERSION, sections: SECTIONS.map((s) => ({ ...s })) }
        for (const name of ENTITY_STORES) {
          const sorted = [...rows[name]].sort(
            (a, b) => (a.__order ?? Infinity) - (b.__order ?? Infinity) || (a.id < b.id ? -1 : 1),
          )
          for (const row of sorted) nextBaseline[name].set(row.id, stableStringify(row))
          state[name] = sorted.map(fromStoredRow)
        }
        const storedVersion = schemaMeta?.schemaVersion ?? SCHEMA_VERSION
        if (storedVersion < SCHEMA_VERSION) state = upgradeStoredState(state, storedVersion)
        baseline = nextBaseline
        return state
      } catch (error) {
        throw wrapError(error)
      }
    })
  }

  function saveAppStateNow(nextState) {
    return serial(async () => {
      assertValidAppState(nextState) // throws AppStateValidationError before touching the DB
      try {
        const db = await openDatabase()

        // Rows to write, keyed by id, with their JSON for diffing.
        const prepared = {}
        for (const name of ENTITY_STORES) {
          const map = new Map()
          nextState[name].forEach((record, index) => {
            const row = toStoredRow(name, record, index)
            map.set(record.id, { row, json: stableStringify(row) })
          })
          prepared[name] = map
        }

        await runTransaction(db, ALL_STORES, 'readwrite', async (tx) => {
          const meta = tx.objectStore(STORE.META)
          const schemaMeta = await request(meta.get(META_KEYS.SCHEMA))
          assertSupportedSchema(schemaMeta)

          // Without a baseline (save before any load) fall back to "replace what is in the DB".
          let base = baseline
          if (!base) {
            base = emptyBaseline()
            const lists = await Promise.all(ENTITY_STORES.map((name) => request(tx.objectStore(name).getAll())))
            ENTITY_STORES.forEach((name, i) => lists[i].forEach((row) => base[name].set(row.id, stableStringify(row))))
          }

          for (const name of ENTITY_STORES) {
            const store = tx.objectStore(name)
            for (const [id, { row, json }] of prepared[name]) {
              if (base[name].get(id) !== json) store.put(row)
            }
            for (const id of base[name].keys()) {
              if (!prepared[name].has(id)) store.delete(id)
            }
          }

          // A save must also stop any later first-run sample import.
          const at = now().toISOString()
          if (!(await request(meta.get(META_KEYS.BOOTSTRAP)))) {
            meta.put({ key: META_KEYS.BOOTSTRAP, completedAt: at, source: 'saved-before-load', schemaVersion: SCHEMA_VERSION })
          }
          if (!schemaMeta) meta.put({ key: META_KEYS.SCHEMA, schemaVersion: SCHEMA_VERSION, updatedAt: at })
        })

        // Only now (transaction committed) does this instance treat the state as persisted.
        const committed = emptyBaseline()
        for (const name of ENTITY_STORES) {
          for (const [id, { json }] of prepared[name]) committed[name].set(id, json)
        }
        baseline = committed
        notifyOtherTabs()
      } catch (error) {
        throw wrapError(error)
      }
    })
  }

  // -------------------------------------------------- cross-tab notifications

  function notifyOtherTabs() {
    if (!broadcast || typeof BroadcastChannel === 'undefined') return
    try {
      if (!postChannel) postChannel = new BroadcastChannel(BROADCAST_NAME)
      postChannel.postMessage({ type: 'saved', origin: instanceId })
    } catch {
      // best effort only
    }
  }

  // Calls `callback` when ANOTHER tab/window saved. Returns an unsubscribe function.
  function onExternalChange(callback) {
    if (!broadcast || typeof BroadcastChannel === 'undefined') return () => {}
    const channel = new BroadcastChannel(BROADCAST_NAME)
    channel.onmessage = (event) => {
      if (event.data && event.data.origin !== instanceId) callback()
    }
    listenChannels.add(channel)
    return () => {
      listenChannels.delete(channel)
      channel.close()
    }
  }

  async function close() {
    for (const channel of listenChannels) channel.close()
    listenChannels.clear()
    if (postChannel) postChannel.close()
    postChannel = null
    if (dbPromise) {
      const db = await dbPromise.catch(() => null)
      if (db) db.close()
    }
    dbPromise = null
    baseline = null
  }

  return {
    loadAppState: loadAppStateNow,
    saveAppState: saveAppStateNow,
    onExternalChange,
    close,
  }
}

// ------------------------------------------------- default (browser) instance

let defaultStorage = null

export function getDefaultStorage() {
  if (!defaultStorage) defaultStorage = createStorage()
  return defaultStorage
}

// Contract API. Resolves with the full AppState (importing the sample data on the very
// first launch only).
export function loadAppState() {
  return getDefaultStorage().loadAppState()
}

// Contract API. Resolves only after the atomic IndexedDB transaction has committed.
export function saveAppState(nextState) {
  return getDefaultStorage().saveAppState(nextState)
}

// -------------------------------------------------------------- controller

// Framework-free store behind useAppStore(). All loads, reloads and commits run one
// at a time through a single promise queue, so two quick actions can never lose an
// update: each updater receives the state that the previous commit has already
// persisted.
export function createAppStoreController({ load, save, subscribeExternal = null, validate = assertValidAppState }) {
  let snapshot = { state: null, status: 'loading', error: null }
  const listeners = new Set()
  let chain = Promise.resolve()
  let startPromise = null

  const getSnapshot = () => snapshot
  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  function publish(patch) {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const toError = (e) => (e instanceof Error ? e : new Error(String(e)))

  function enqueue(task) {
    const result = chain.then(task)
    chain = result.catch(() => {})
    return result
  }

  function reload() {
    return enqueue(async () => {
      if (snapshot.state === null) publish({ status: 'loading', error: null })
      try {
        const state = await load()
        publish({ state, status: 'ready', error: null })
      } catch (error) {
        publish({ status: 'error', error: toError(error) }) // last good state (if any) is kept
        throw error
      }
    })
  }

  // Idempotent: the first call loads the database, later calls return the same promise.
  function start() {
    if (!startPromise) {
      startPromise = reload().catch(() => {}) // the error is exposed through the snapshot
      if (subscribeExternal) subscribeExternal(() => reload().catch(() => {}))
    }
    return startPromise
  }

  function commit(updater) {
    start()
    return enqueue(async () => {
      const current = snapshot.state
      if (current === null) {
        const error = new StorageError('NOT_READY', 'The data could not be loaded, so changes cannot be saved yet.')
        throw error
      }
      let next
      try {
        next = await updater(current)
        if (next === current) return // updater made no change: nothing to save
        validate(next)
      } catch (error) {
        publish({ status: 'error', error: toError(error) })
        throw error
      }
      publish({ status: 'saving', error: null })
      try {
        await save(next)
      } catch (error) {
        publish({ status: 'error', error: toError(error) }) // `state` stays the last persisted state
        throw error
      }
      publish({ state: next, status: 'ready', error: null })
    })
  }

  function dismissError() {
    if (snapshot.error && snapshot.status === 'error' && snapshot.state !== null) {
      publish({ status: 'ready', error: null })
    }
  }

  return { getSnapshot, subscribe, start, commit, reload, dismissError }
}
