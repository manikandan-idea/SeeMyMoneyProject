// Individual transaction domain + history selectors (Developer 3).
// Pure functions: writes take an AppState and return a NEW AppState.
// Every money occurrence is its own row; grouping is display-only.

const SECTION_IDS = ['income', 'expense', 'saving']
const SOURCES = ['checklist', 'checklist-other', 'other', 'manual', 'folder-one-time']

// Local fallback ID helper (crypto.randomUUID with a safe fallback).
export function newTransactionId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`
}

// Local calendar date YYYY-MM-DD (NOT the UTC slice of toISOString()).
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function assertAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number (INR).')
  }
}

function txOf(state) {
  return Array.isArray(state?.transactions) ? state.transactions : []
}

/**
 * createTransaction(state, { sectionId, folderId, checklistId, description,
 *   amount, transactionType, source, now? }) -> AppState
 * `now` (optional Date) exists for deterministic tests.
 */
export function createTransaction(state, input = {}) {
  const { checklistId = null, folderId: inFolderId = null, source: inSource, now } = input
  assertAmount(input.amount)

  const template = checklistId
    ? (state.checklists || []).find((c) => c.id === checklistId)
    : null
  if (checklistId && !template) {
    throw new Error(`Checklist "${checklistId}" not found; cannot record against it.`)
  }

  const sectionId = input.sectionId || template?.sectionId
  if (!SECTION_IDS.includes(sectionId)) throw new Error(`Invalid sectionId: ${sectionId}`)

  const folderId = inFolderId ?? template?.folderId ?? null
  const folder = folderId ? (state.folders || []).find((f) => f.id === folderId) : null
  if (folderId && !folder && !template) {
    throw new Error(`Folder "${folderId}" not found.`)
  }

  const transactionType = input.transactionType || template?.transactionType || sectionId
  if (!SECTION_IDS.includes(transactionType)) throw new Error(`Invalid transactionType: ${transactionType}`)

  const source = inSource || (template ? 'checklist' : 'manual')
  if (!SOURCES.includes(source)) throw new Error(`Invalid source: ${source}`)
  if ((source === 'checklist' || source === 'checklist-other') && !template) {
    throw new Error(`Source "${source}" requires a checklistId.`)
  }

  const description = (input.description ?? template?.title ?? '').toString().trim()
  if (!description) throw new Error('Description is required.')

  const date = now instanceof Date ? now : new Date()
  const tx = {
    id: newTransactionId(),
    sectionId,
    folderId,
    folderNameSnapshot: folder ? folder.name : null,
    checklistId: template ? template.id : null,
    checklistTitleSnapshot: template ? template.title : null,
    description,
    amount: input.amount,
    transactionType,
    recordedAt: date.toISOString(),
    transactionDate: localDateKey(date),
    source,
  }
  return { ...state, transactions: [...txOf(state), tx] }
}

/** Changes only the selected row. Unknown id -> state returned unchanged. */
export function updateTransactionAmount(state, transactionId, newAmount) {
  assertAmount(newAmount)
  const list = txOf(state)
  if (!list.some((t) => t.id === transactionId)) return state
  const updatedAt = new Date().toISOString()
  return {
    ...state,
    transactions: list.map((t) => (t.id === transactionId ? { ...t, amount: newAmount, updatedAt } : t)),
  }
}

/** Removes exactly one row by id. Touches nothing else. */
export function deleteTransaction(state, transactionId) {
  const list = txOf(state)
  if (!list.some((t) => t.id === transactionId)) return state
  return { ...state, transactions: list.filter((t) => t.id !== transactionId) }
}

/** Puts back a row removed by undo (same id, same data). No-op when the id already exists. */
export function restoreTransaction(state, tx) {
  if (!tx || typeof tx.id !== 'string') return state
  if (txOf(state).some((t) => t.id === tx.id)) return state
  return { ...state, transactions: [...txOf(state), tx] }
}

/** The most recently recorded row of a checklist (null when it has none). Used by Undo. */
export function getLatestChecklistTransaction(state, checklistId) {
  if (!checklistId) return null
  let best = null
  let bestIndex = -1
  txOf(state).forEach((t, i) => {
    if (t.checklistId !== checklistId) return
    const later = !best || (t.recordedAt || '') > (best.recordedAt || '')
      || ((t.recordedAt || '') === (best.recordedAt || '') && i > bestIndex)
    if (later) { best = t; bestIndex = i }
  })
  return best
}

/** Newest first. Filters: sectionId, transactionType, fromDate, toDate (local YYYY-MM-DD), search. */
export function selectHistoryRecords(state, filters = {}) {
  const { sectionId, transactionType, fromDate, toDate, search } = filters || {}
  const q = (search || '').trim().toLowerCase()
  return txOf(state)
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (sectionId && t.sectionId !== sectionId) return false
      if (transactionType && t.transactionType !== transactionType) return false
      if (fromDate && (!t.transactionDate || t.transactionDate < fromDate)) return false
      if (toDate && (!t.transactionDate || t.transactionDate > toDate)) return false
      if (q) {
        const hay = `${t.description || ''} ${t.checklistTitleSnapshot || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      const ta = a.t.recordedAt || ''
      const tb = b.t.recordedAt || ''
      if (ta !== tb) return ta < tb ? 1 : -1
      return b.i - a.i
    })
    .map(({ t }) => t)
}

/**
 * Display-only grouping: checklistId + amount (or type + description + amount
 * for unlinked entries). Returns groups; the input rows are never altered.
 * Group: { key, checklistId, title, transactionType, amount, count, total, latestRecordedAt, records }
 */
export function groupTransactionsByChecklistAndAmount(records) {
  const map = new Map()
  for (const r of records || []) {
    const key = r.checklistId
      ? `c:${r.checklistId}|${r.amount}`
      : `m:${r.transactionType}|${(r.description || '').trim().toLowerCase()}|${r.amount}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        checklistId: r.checklistId || null,
        title: r.checklistTitleSnapshot || r.description,
        transactionType: r.transactionType,
        amount: r.amount,
        count: 0,
        total: 0,
        latestRecordedAt: r.recordedAt,
        records: [],
      }
      map.set(key, g)
    }
    g.records.push(r)
    g.count += 1
    g.total += r.amount
    if ((r.recordedAt || '') > (g.latestRecordedAt || '')) g.latestRecordedAt = r.recordedAt
  }
  return [...map.values()].sort((a, b) => (a.latestRecordedAt < b.latestRecordedAt ? 1 : -1))
}

/** Every surviving transaction linked to the checklist, any amount. Saving Area entries never count. */
export function getChecklistUsageCount(state, checklistId) {
  if (!checklistId) return 0
  return txOf(state).filter((t) => t.checklistId === checklistId).length
}
