// See My Money — canonical data schema, ID/date helpers and AppState validation.
// Pure module: no IndexedDB, no React. Shared by storage, migrations and every
// other module that needs section ids, local-date keys or unique ids.

export const SCHEMA_VERSION = 1

export const DB_NAME = 'see-my-money'
export const DB_VERSION = 1

export const STORE = Object.freeze({
  FOLDERS: 'folders',
  CHECKLISTS: 'checklists',
  TRANSACTIONS: 'transactions',
  SAVING_AREA_ENTRIES: 'savingAreaEntries',
  META: 'meta',
})

// The four stores that make up AppState (meta is bookkeeping only).
export const ENTITY_STORES = Object.freeze([
  STORE.FOLDERS,
  STORE.CHECKLISTS,
  STORE.TRANSACTIONS,
  STORE.SAVING_AREA_ENTRIES,
])

export const META_KEYS = Object.freeze({
  SCHEMA: 'schema', // { key, schemaVersion, updatedAt }
  BOOTSTRAP: 'bootstrap', // { key, completedAt, source, ... } — written exactly once
})

// Fields whose names start with this prefix are storage-internal (row order,
// derived index keys). They are written by storage.js and stripped on load; they
// never appear in AppState.
export const INTERNAL_PREFIX = '__'

// Object store layout. NOTE: IndexedDB cannot index booleans, null or undefined
// (those rows are simply absent from the index). So:
//  - the `hidden` index points at the internal numeric field `__hidden` (0 / 1);
//  - the `parentFolderId`, `folderId`, `checklistId`, `periodKey` indexes only
//    contain rows where the value is a non-null string;
//  - `settlementStatus` is requested by the project brief but is not part of the
//    shared SavingAreaEntry shape; the index exists and is empty until a field
//    with that name is ever written.
export const STORE_DEFINITIONS = Object.freeze({
  [STORE.FOLDERS]: {
    keyPath: 'id',
    indexes: [
      { name: 'sectionId', keyPath: 'sectionId' },
      { name: 'parentFolderId', keyPath: 'parentFolderId' },
      { name: 'hidden', keyPath: '__hidden' },
      { name: 'periodKey', keyPath: 'periodKey' },
    ],
  },
  [STORE.CHECKLISTS]: {
    keyPath: 'id',
    indexes: [
      { name: 'sectionId', keyPath: 'sectionId' },
      { name: 'folderId', keyPath: 'folderId' },
    ],
  },
  [STORE.TRANSACTIONS]: {
    keyPath: 'id',
    indexes: [
      { name: 'sectionId', keyPath: 'sectionId' },
      { name: 'folderId', keyPath: 'folderId' },
      { name: 'checklistId', keyPath: 'checklistId' },
      { name: 'recordedAt', keyPath: 'recordedAt' },
      { name: 'transactionDate', keyPath: 'transactionDate' },
    ],
  },
  [STORE.SAVING_AREA_ENTRIES]: {
    keyPath: 'id',
    indexes: [
      { name: 'sectionId', keyPath: 'sectionId' },
      { name: 'ownerFolderId', keyPath: 'ownerFolderId' },
      { name: 'sourceId', keyPath: 'sourceId' },
      { name: 'settlementStatus', keyPath: 'settlementStatus' },
    ],
  },
  [STORE.META]: { keyPath: 'key', indexes: [] },
})

export const SECTIONS = Object.freeze([
  Object.freeze({ id: 'income', title: 'Income' }),
  Object.freeze({ id: 'expense', title: 'Expense' }),
  Object.freeze({ id: 'saving', title: 'Saving' }),
])
export const SECTION_IDS = Object.freeze(SECTIONS.map((section) => section.id))

export const TRANSACTION_TYPES = SECTION_IDS
export const FOLDER_USAGES = Object.freeze(['daily', 'monthly', 'yearly', 'occasional'])
export const FOLDER_FREQUENCIES = Object.freeze(['once', 'multiple'])
export const TRANSACTION_SOURCES = Object.freeze([
  'checklist',
  'checklist-other',
  'other',
  'manual',
  'folder-one-time',
])
export const SAVING_SOURCE_TYPES = Object.freeze(['checklist', 'folder'])

// ---------------------------------------------------------------- IDs & dates

let fallbackCounter = 0

// crypto.randomUUID() only exists in secure contexts (https / localhost); the
// fallbacks keep the app working when served over plain http on a LAN.
export function createId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
  fallbackCounter += 1
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${fallbackCounter}`
}

export function nowIso(date = new Date()) {
  return date.toISOString()
}

const pad2 = (n) => String(n).padStart(2, '0')

// Local calendar date "YYYY-MM-DD" — deliberately NOT toISOString().slice(0, 10),
// which is the UTC date and is wrong for India late evening / early morning.
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// Local date key of an ISO timestamp; null if the timestamp is invalid.
export function isoToLocalDateKey(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : localDateKey(date)
}

// daily -> YYYY-MM-DD, monthly -> YYYY-MM, yearly -> YYYY (local time).
export function currentPeriodKey(usage, date = new Date()) {
  if (usage === 'monthly') return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
  if (usage === 'yearly') return String(date.getFullYear())
  return localDateKey(date)
}

export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sections: SECTIONS.map((section) => ({ ...section })),
    folders: [],
    checklists: [],
    transactions: [],
    savingAreaEntries: [],
  }
}

// JSON with sorted object keys, so two equal records always produce the same text.
export function stableStringify(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted = {}
      for (const k of Object.keys(v).sort()) sorted[k] = v[k]
      return sorted
    }
    return v
  })
}

// ---------------------------------------------------------------- validation

export class AppStateValidationError extends Error {
  constructor(problems) {
    const shown = problems.slice(0, 5).join(' ')
    const more = problems.length > 5 ? ` (+${problems.length - 5} more)` : ''
    super(`Invalid app data, nothing was saved. ${shown}${more}`)
    this.name = 'AppStateValidationError'
    this.code = 'INVALID_STATE'
    this.problems = problems
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0
const isStringOrNull = (v) => v === null || typeof v === 'string'
const isPositiveAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
const isTimestamp = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

export function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

// Returns a list of human-readable problems ([] = valid). Checks shape,
// enumerations, positive amounts, timestamps, unique ids and the folder tree.
// Deliberately does NOT enforce foreign keys for transactions (their folderId /
// checklistId are historical references that may outlive the template).
export function validateAppState(state) {
  if (!isObject(state)) return ['AppState must be an object.']
  const problems = []
  const add = (message) => problems.push(message)

  if (state.schemaVersion !== SCHEMA_VERSION) {
    add(`schemaVersion must be ${SCHEMA_VERSION}.`)
  }

  const checks = {
    [STORE.FOLDERS]: checkFolder,
    [STORE.CHECKLISTS]: checkChecklist,
    [STORE.TRANSACTIONS]: checkTransaction,
    [STORE.SAVING_AREA_ENTRIES]: checkSavingEntry,
  }

  for (const storeName of ENTITY_STORES) {
    const list = state[storeName]
    if (!Array.isArray(list)) {
      add(`${storeName} must be an array.`)
      continue
    }
    const seen = new Set()
    list.forEach((record, index) => {
      const label = `${storeName}[${index}]${isObject(record) && record.id ? ` (id ${record.id})` : ''}`
      if (!isObject(record)) return add(`${label} must be an object.`)
      if (!isNonEmptyString(record.id)) return add(`${label} needs a non-empty string id.`)
      if (seen.has(record.id)) add(`${label} has a duplicate id.`)
      seen.add(record.id)
      if (!SECTION_IDS.includes(record.sectionId)) add(`${label} has an invalid sectionId.`)
      checks[storeName](record, label, add)
    })
  }

  if (Array.isArray(state.folders)) checkFolderTree(state.folders, add)
  return problems
}

export function assertValidAppState(state) {
  const problems = validateAppState(state)
  if (problems.length > 0) throw new AppStateValidationError(problems)
  return state
}

function checkFolder(f, label, add) {
  if (!isStringOrNull(f.parentFolderId)) add(`${label}.parentFolderId must be a string or null.`)
  if (typeof f.name !== 'string') add(`${label}.name must be a string.`)
  if (f.usage !== null && !FOLDER_USAGES.includes(f.usage)) add(`${label}.usage is invalid.`)
  if (f.frequency !== null && !FOLDER_FREQUENCIES.includes(f.frequency)) {
    add(`${label}.frequency is invalid.`)
  }
  if (typeof f.othersEnabled !== 'boolean') add(`${label}.othersEnabled must be a boolean.`)
  if (typeof f.hidden !== 'boolean') add(`${label}.hidden must be a boolean.`)
  if (!isStringOrNull(f.periodKey)) add(`${label}.periodKey must be a string or null.`)
  if (!isTimestamp(f.createdAt)) add(`${label}.createdAt must be an ISO timestamp.`)
  if (!isTimestamp(f.updatedAt)) add(`${label}.updatedAt must be an ISO timestamp.`)
}

function checkChecklist(c, label, add) {
  // null = a checklist that lives directly on a period page (not inside a folder)
  if (!isStringOrNull(c.folderId)) add(`${label}.folderId must be a folder id or null.`)
  if (typeof c.title !== 'string') add(`${label}.title must be a string.`)
  if (!isPositiveAmount(c.defaultAmount)) add(`${label}.defaultAmount must be a positive number.`)
  if (!TRANSACTION_TYPES.includes(c.transactionType)) add(`${label}.transactionType is invalid.`)
  if (!isStringOrNull(c.frequency)) add(`${label}.frequency must be a string or null.`)
  if (!isTimestamp(c.createdAt)) add(`${label}.createdAt must be an ISO timestamp.`)
  if (!isTimestamp(c.updatedAt)) add(`${label}.updatedAt must be an ISO timestamp.`)
}

function checkTransaction(t, label, add) {
  if (!isStringOrNull(t.folderId)) add(`${label}.folderId must be a string or null.`)
  if (!isStringOrNull(t.folderNameSnapshot)) add(`${label}.folderNameSnapshot must be a string or null.`)
  if (!isStringOrNull(t.checklistId)) add(`${label}.checklistId must be a string or null.`)
  if (!isStringOrNull(t.checklistTitleSnapshot)) {
    add(`${label}.checklistTitleSnapshot must be a string or null.`)
  }
  if (typeof t.description !== 'string') add(`${label}.description must be a string.`)
  if (!isPositiveAmount(t.amount)) add(`${label}.amount must be a positive number.`)
  if (!TRANSACTION_TYPES.includes(t.transactionType)) add(`${label}.transactionType is invalid.`)
  if (!isTimestamp(t.recordedAt)) add(`${label}.recordedAt must be an ISO timestamp.`)
  if (!isValidDateKey(t.transactionDate)) add(`${label}.transactionDate must be a local YYYY-MM-DD date.`)
  if (!TRANSACTION_SOURCES.includes(t.source)) add(`${label}.source is invalid.`)
  if (t.updatedAt !== undefined && !isTimestamp(t.updatedAt)) {
    add(`${label}.updatedAt must be an ISO timestamp when present.`)
  }
}

function checkSavingEntry(e, label, add) {
  if (!isNonEmptyString(e.ownerFolderId)) add(`${label}.ownerFolderId must be a folder id.`)
  if (!SAVING_SOURCE_TYPES.includes(e.sourceType)) add(`${label}.sourceType is invalid.`)
  if (!isNonEmptyString(e.sourceId)) add(`${label}.sourceId must be an id.`)
  if (typeof e.titleSnapshot !== 'string') add(`${label}.titleSnapshot must be a string.`)
  if (!isTimestamp(e.addedAt)) add(`${label}.addedAt must be an ISO timestamp.`)
  if (e.amount !== undefined && !(Number(e.amount) > 0)) add(`${label}.amount must be a positive number when present.`)
}

// Every parent must exist (same section) and the parent chain must not loop —
// otherwise a folder (and its data) would silently become unreachable.
function checkFolderTree(folders, add) {
  const byId = new Map()
  for (const f of folders) if (isObject(f) && isNonEmptyString(f.id)) byId.set(f.id, f)
  for (const f of byId.values()) {
    if (typeof f.parentFolderId !== 'string') continue
    const parent = byId.get(f.parentFolderId)
    if (!parent) {
      add(`Folder ${f.id} points to a missing parent folder (${f.parentFolderId}).`)
      continue
    }
    if (parent.sectionId !== f.sectionId) add(`Folder ${f.id} is in a different section than its parent.`)
    const visited = new Set([f.id])
    let cursor = parent
    while (cursor && typeof cursor.id === 'string') {
      if (visited.has(cursor.id)) {
        add(`Folder ${f.id} is part of a parent loop.`)
        break
      }
      visited.add(cursor.id)
      cursor = typeof cursor.parentFolderId === 'string' ? byId.get(cursor.parentFolderId) : null
    }
  }
}

// ----------------------------------------------- stored-row <-> record helpers

// Rows are stored with an internal `__order` (array position, so lists come back
// in the same order the app saved them) and, for folders, `__hidden` (0/1) because
// IndexedDB cannot index booleans.
export function toStoredRow(storeName, record, order) {
  const row = { ...record, __order: order }
  if (storeName === STORE.FOLDERS) row.__hidden = record.hidden ? 1 : 0
  return row
}

export function fromStoredRow(row) {
  const record = {}
  for (const key of Object.keys(row)) {
    if (!key.startsWith(INTERNAL_PREFIX)) record[key] = row[key]
  }
  return record
}
