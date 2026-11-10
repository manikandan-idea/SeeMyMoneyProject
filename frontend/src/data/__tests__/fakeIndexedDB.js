// Minimal in-memory IndexedDB used ONLY by the tests (no dependencies available).
// Models what the storage layer relies on:
//   * transactions that stage writes and commit/rollback atomically;
//   * auto-commit once no requests are pending (so awaiting non-IDB work inside a
//     transaction would fail here just like in a browser);
//   * indexes that skip rows whose key is not a valid key (null/boolean/undefined);
//   * failure injection via `hooks.beforeWrite`.

const tick = (fn) => setTimeout(fn, 0)

function domError(name, message) {
  const error = new Error(message)
  error.name = name
  return error
}

const getPath = (value, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), value)
const isValidKey = (k) => typeof k === 'string' || (typeof k === 'number' && !Number.isNaN(k))
const compareKeys = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

class FakeRequest {
  constructor() {
    this.result = undefined
    this.error = null
    this.onsuccess = null
    this.onerror = null
  }
}

class FakeIndex {
  constructor(store, name, keyPath) {
    this.store = store
    this.name = name
    this.keyPath = keyPath
  }
  _rows() {
    return [...this.store._data().values()]
      .filter((row) => isValidKey(getPath(row, this.keyPath)))
      .sort((a, b) => compareKeys(getPath(a, this.keyPath), getPath(b, this.keyPath)))
  }
  getAll(query) {
    return this.store._enqueue(() =>
      this._rows()
        .filter((row) => query === undefined || getPath(row, this.keyPath) === query)
        .map((row) => structuredClone(row)),
    )
  }
  count(query) {
    return this.store._enqueue(
      () => this._rows().filter((row) => query === undefined || getPath(row, this.keyPath) === query).length,
    )
  }
}

class FakeObjectStore {
  constructor(tx, name, def) {
    this.tx = tx
    this.name = name
    this.keyPath = def.keyPath
    this.def = def
    this.indexNames = { contains: (n) => def.indexes.has(n) }
  }
  _data() {
    return this.tx._staged.get(this.name)
  }
  _enqueue(exec, isWrite = false, hookArgs = null) {
    return this.tx._enqueue(() => {
      if (isWrite) {
        if (this.tx.mode !== 'readwrite') throw domError('ReadOnlyError', 'read-only transaction')
        const hooks = this.tx.db.factory.hooks
        if (hooks.beforeWrite && hookArgs) hooks.beforeWrite(this.name, hookArgs.op, hookArgs.value)
      }
      return exec()
    })
  }
  put(value) {
    const key = value[this.keyPath]
    return this._enqueue(() => (this._data().set(key, structuredClone(value)), key), true, { op: 'put', value })
  }
  add(value) {
    const key = value[this.keyPath]
    return this._enqueue(
      () => {
        if (this._data().has(key)) throw domError('ConstraintError', `key exists: ${key}`)
        this._data().set(key, structuredClone(value))
        return key
      },
      true,
      { op: 'add', value },
    )
  }
  delete(key) {
    return this._enqueue(() => (this._data().delete(key), undefined), true, { op: 'delete', value: key })
  }
  get(key) {
    return this._enqueue(() => (this._data().has(key) ? structuredClone(this._data().get(key)) : undefined))
  }
  getAll() {
    return this._enqueue(() => [...this._data().values()].map((row) => structuredClone(row)))
  }
  count() {
    return this._enqueue(() => this._data().size)
  }
  index(name) {
    if (!this.def.indexes.has(name)) throw domError('NotFoundError', `no index ${name}`)
    return new FakeIndex(this, name, this.def.indexes.get(name))
  }
  createIndex(name, keyPath) {
    this.def.indexes.set(name, keyPath)
  }
}

class FakeTransaction {
  constructor(db, storeNames, mode) {
    this.db = db
    this.mode = mode
    this.storeNames = storeNames
    this.error = null
    this.oncomplete = null
    this.onabort = null
    this.onerror = null
    this._pending = 0
    this._finished = false
    this._staged = new Map()
    for (const name of storeNames) {
      this._staged.set(name, new Map([...db.data.get(name)].map(([k, v]) => [k, structuredClone(v)])))
    }
    tick(() => this._maybeComplete())
  }
  objectStore(name) {
    if (!this.storeNames.includes(name)) throw domError('NotFoundError', `store ${name} not in transaction`)
    return new FakeObjectStore(this, name, this.db.defs.get(name))
  }
  _enqueue(exec) {
    if (this._finished) throw domError('TransactionInactiveError', 'The transaction has finished.')
    const req = new FakeRequest()
    this._pending += 1
    tick(() => {
      if (this._finished) return
      try {
        req.result = exec()
        if (req.onsuccess) req.onsuccess({ target: req })
      } catch (error) {
        req.error = error
        if (req.onerror) req.onerror({ target: req, preventDefault() {} })
        this._pending -= 1
        this._abort(error)
        return
      }
      this._pending -= 1
      tick(() => this._maybeComplete())
    })
    return req
  }
  _maybeComplete() {
    if (this._finished || this._pending > 0) return
    this._finished = true
    if (this.mode === 'readwrite') {
      for (const [name, map] of this._staged) this.db.data.set(name, map)
    }
    if (this.oncomplete) this.oncomplete({ target: this })
  }
  _abort(error) {
    if (this._finished) return
    this._finished = true
    this.error = error ?? domError('AbortError', 'aborted')
    if (this.onerror) this.onerror({ target: this })
    if (this.onabort) this.onabort({ target: this })
  }
  abort() {
    this._abort(domError('AbortError', 'The transaction was aborted.'))
  }
}

class FakeDatabase {
  constructor(factory, name) {
    this.factory = factory
    this.name = name
    this.data = new Map() // storeName -> Map(key -> row)
    this.defs = new Map() // storeName -> { keyPath, indexes: Map(name -> keyPath) }
    this.version = 0
    this.objectStoreNames = { contains: (n) => this.defs.has(n) }
    this.onversionchange = null
    this.onclose = null
  }
  createObjectStore(name, { keyPath }) {
    this.defs.set(name, { keyPath, indexes: new Map() })
    this.data.set(name, new Map())
    return new FakeObjectStore({ db: this, _staged: this.data }, name, this.defs.get(name))
  }
  transaction(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    for (const n of names) if (!this.defs.has(n)) throw domError('NotFoundError', `no store ${n}`)
    return new FakeTransaction(this, names, mode)
  }
  close() {}
}

export function createFakeIndexedDB() {
  const databases = new Map()
  const factory = {
    hooks: { beforeWrite: null },
    databases,
    open(name, version) {
      const req = {
        result: undefined,
        error: null,
        transaction: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      }
      tick(() => {
        let db = databases.get(name)
        const isNew = !db
        if (isNew) {
          db = new FakeDatabase(factory, name)
          databases.set(name, db)
        }
        req.result = db
        if (isNew || db.version < version) {
          const oldVersion = db.version
          db.version = version
          // upgrade transaction: writes directly to live data (single-threaded here)
          req.transaction = {
            objectStore: (n) => new FakeObjectStore({ db, _staged: db.data }, n, db.defs.get(n)),
            abort() {},
          }
          if (req.onupgradeneeded) req.onupgradeneeded({ oldVersion })
        }
        tick(() => req.onsuccess && req.onsuccess({ target: req }))
      })
      return req
    },
  }
  return factory
}
