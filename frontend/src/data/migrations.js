// See My Money — migrations.
//
// 1. migrateLegacyData(): one-time, PURE conversion of the old nested in-memory
//    shape (src/data/sampleData.js) into the canonical normalized AppState.
//    It never mutates its input, never settles/auto-submits period folders and
//    never invents records, dates or amounts.
// 2. upgradeStoredState(): hook for future AppState schema upgrades.

import {
  SCHEMA_VERSION,
  SECTION_IDS,
  FOLDER_USAGES,
  FOLDER_FREQUENCIES,
  createEmptyState,
  localDateKey,
} from './schema.js'

const ZONELESS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i

function fromLocalParts(y, mo, d, h = 0, mi = 0, s = 0) {
  const date = new Date(y, mo - 1, d, h, mi, s)
  const ok =
    date.getFullYear() === y &&
    date.getMonth() === mo - 1 &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === mi
  return ok ? date : null
}

// Legacy timestamps look like "2026-08-18T14:20:00" (no zone). The old app parsed
// those as LOCAL time, so we do too: same instant, written as a full ISO string,
// and transactionDate is the date exactly as the user saw it.
// Returns { recordedAt, transactionDate, approximated } or null if unusable.
export function normalizeLegacyTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const text = value.trim()

  const zoneless = ZONELESS.exec(text)
  if (zoneless) {
    const [y, mo, d, h, mi, s] = zoneless.slice(1).map((part) => (part === undefined ? 0 : Number(part)))
    const date = fromLocalParts(y, mo, d, h, mi, s)
    if (!date) return null
    return {
      recordedAt: date.toISOString(),
      transactionDate: `${zoneless[1]}-${zoneless[2]}-${zoneless[3]}`,
      approximated: false,
    }
  }

  const dateOnly = DATE_ONLY.exec(text)
  if (dateOnly) {
    // The day is known, the time of day is not: local midnight, flagged in the report.
    const date = fromLocalParts(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))
    if (!date) return null
    return { recordedAt: date.toISOString(), transactionDate: text, approximated: true }
  }

  if (HAS_ZONE.test(text)) {
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) return null
    return { recordedAt: date.toISOString(), transactionDate: localDateKey(date), approximated: false }
  }
  return null
}

const isPositiveAmount = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0

// Convert the legacy nested tree into the canonical AppState.
// legacy = { income: {folders, items}, expense: {...}, saving: {...} }
// Returns { state, report }. `now` only stamps folder/checklist createdAt/updatedAt
// (legacy folders have no creation date; the import time is the honest value).
export function migrateLegacyData(legacy, { now = new Date() } = {}) {
  const migratedAt = now.toISOString()
  const state = createEmptyState()
  const report = {
    migratedAt,
    counts: { folders: 0, checklists: 0, transactions: 0 },
    legacyRowsSeen: { items: 0, others: 0 },
    duplicatesDropped: [],
    idsRenamed: [],
    skipped: [],
    approximatedTimestamps: [],
    checklistCounterMismatches: [],
    ignoredSections: [],
    notes: [],
  }
  const ctx = {
    state,
    report,
    migratedAt,
    seen: { folders: new Map(), checklists: new Map(), transactions: new Map() },
    generated: { folders: 0, checklists: 0, transactions: 0 },
  }

  if (legacy && typeof legacy === 'object') {
    for (const key of Object.keys(legacy)) {
      if (!SECTION_IDS.includes(key)) report.ignoredSections.push(key)
    }
    for (const sectionId of SECTION_IDS) {
      const root = legacy[sectionId]
      if (!root || typeof root !== 'object') continue
      if (Array.isArray(root.checklist) && root.checklist.length > 0) {
        report.notes.push(
          `Section "${sectionId}" root had ${root.checklist.length} checklist row(s) but a checklist needs a folder; they were not migrated.`,
        )
        for (const row of root.checklist) {
          report.skipped.push(skipEntry('checklist', row, 'checklist directly under a section root', sectionId, []))
        }
      }
      migrateEntries(ctx, root, sectionId, null, [])
      for (const folder of root.folders ?? []) migrateFolder(ctx, folder, sectionId, null, [])
    }
  }

  report.counts.folders = state.folders.length
  report.counts.checklists = state.checklists.length
  report.counts.transactions = state.transactions.length
  return { state, report }
}

// Resolve a legacy id into a unique id for `kind`.
//  - unseen id                         -> keep it
//  - seen, identical content           -> genuine duplicate: { duplicate: true }
//  - seen, different content (collision) -> keep both, give this one a
//    deterministic new id "<id>~dupN" and report it
function resolveId(ctx, kind, rawId, fingerprint) {
  let base
  if (typeof rawId === 'string' && rawId !== '') base = rawId
  else if (typeof rawId === 'number' && Number.isFinite(rawId)) base = String(rawId)
  else {
    ctx.generated[kind] += 1
    base = `legacy-${kind}-${ctx.generated[kind]}`
    ctx.report.idsRenamed.push({ kind, from: null, to: base, reason: 'missing id' })
  }
  const seen = ctx.seen[kind]
  if (!seen.has(base)) {
    seen.set(base, fingerprint)
    return { id: base, duplicate: false }
  }
  if (seen.get(base) === fingerprint) return { id: base, duplicate: true }
  let n = 2
  let candidate = `${base}~dup${n}`
  while (seen.has(candidate)) {
    n += 1
    candidate = `${base}~dup${n}`
  }
  seen.set(candidate, fingerprint)
  ctx.report.idsRenamed.push({ kind, from: base, to: candidate, reason: 'same id, different content' })
  return { id: candidate, duplicate: false }
}

function skipEntry(kind, original, reason, sectionId, path) {
  return {
    kind,
    id: original && typeof original === 'object' ? (original.id ?? null) : null,
    reason,
    sectionId,
    path: [...path],
    original: JSON.parse(JSON.stringify(original ?? null)), // kept in the report, never lost
  }
}

function migrateFolder(ctx, legacyFolder, sectionId, parentFolderId, path) {
  if (!legacyFolder || typeof legacyFolder !== 'object') {
    ctx.report.skipped.push(skipEntry('folder', legacyFolder, 'not an object', sectionId, path))
    return
  }
  const name = typeof legacyFolder.name === 'string' ? legacyFolder.name : ''
  const fingerprint = `${sectionId}|${parentFolderId}|${name}`
  const { id, duplicate } = resolveId(ctx, 'folders', legacyFolder.id, fingerprint)

  const folderRow = {
    id,
    sectionId,
    parentFolderId,
    name,
    usage: FOLDER_USAGES.includes(legacyFolder.usage) ? legacyFolder.usage : null,
    frequency: FOLDER_FREQUENCIES.includes(legacyFolder.frequency) ? legacyFolder.frequency : null,
    othersEnabled: Boolean(legacyFolder.othersEnabled),
    hidden: Boolean(legacyFolder.hidden),
    // Preserved as-is, even when stale. Migration never settles/auto-submits.
    periodKey: typeof legacyFolder.periodKey === 'string' ? legacyFolder.periodKey : null,
    createdAt: ctx.migratedAt,
    updatedAt: ctx.migratedAt,
  }
  if (duplicate) {
    ctx.report.duplicatesDropped.push({ kind: 'folder', id, reason: 'identical folder id repeated' })
  } else {
    ctx.state.folders.push(folderRow)
  }

  const here = [...path, name]
  migrateChecklist(ctx, legacyFolder, folderRow, sectionId, here)
  migrateEntries(ctx, legacyFolder, sectionId, folderRow, here)
  for (const child of legacyFolder.folders ?? []) migrateFolder(ctx, child, sectionId, id, here)
}

function migrateChecklist(ctx, legacyFolder, folderRow, sectionId, path) {
  const frequency = ['daily', 'monthly', 'yearly'].includes(folderRow.usage) ? folderRow.usage : null
  for (const row of legacyFolder.checklist ?? []) {
    if (!row || typeof row !== 'object') {
      ctx.report.skipped.push(skipEntry('checklist', row, 'not an object', sectionId, path))
      continue
    }
    if (!isPositiveAmount(row.amount)) {
      ctx.report.skipped.push(skipEntry('checklist', row, 'amount is not a positive number', sectionId, path))
      continue
    }
    const title = typeof row.title === 'string' ? row.title : ''
    const fingerprint = `${folderRow.id}|${title}|${row.amount}`
    const { id, duplicate } = resolveId(ctx, 'checklists', row.id, fingerprint)
    if (duplicate) {
      ctx.report.duplicatesDropped.push({ kind: 'checklist', id, reason: 'identical checklist id repeated' })
      continue
    }
    ctx.state.checklists.push({
      id,
      sectionId,
      folderId: folderRow.id,
      title,
      defaultAmount: row.amount,
      transactionType: sectionId,
      frequency,
      createdAt: ctx.migratedAt,
      updatedAt: ctx.migratedAt,
    })
    // timesRecorded / lastRecorded were running counters, not records. They are NOT
    // turned into transactions. Report any counter that no real row backs up.
    const times = typeof row.timesRecorded === 'number' ? row.timesRecorded : 0
    if (times > 0) {
      const sameTitleRows = (legacyFolder.items ?? []).filter((item) => item && item.description === title).length
      ctx.report.checklistCounterMismatches.push({
        checklistId: id,
        title,
        folderId: folderRow.id,
        legacyTimesRecorded: times,
        linkedTransactionRows: 0,
        sameTitleRowsInFolder: sameTitleRows,
      })
    }
  }
}

// Legacy `items` and `others` of one node -> independent Transaction rows.
// folderRow === null means a section root.
function migrateEntries(ctx, node, sectionId, folderRow, path) {
  const lists = [
    ['item', node.items],
    ['other', node.others],
  ]
  for (const [kind, rows] of lists) {
    for (const raw of rows ?? []) {
      ctx.report.legacyRowsSeen[kind === 'item' ? 'items' : 'others'] += 1
      migrateTransaction(ctx, raw, kind, sectionId, folderRow, path)
    }
  }
}

function migrateTransaction(ctx, raw, kind, sectionId, folderRow, path) {
  if (!raw || typeof raw !== 'object') {
    return ctx.report.skipped.push(skipEntry(kind, raw, 'not an object', sectionId, path))
  }
  if (!isPositiveAmount(raw.amount)) {
    return ctx.report.skipped.push(skipEntry(kind, raw, 'amount is not a positive number', sectionId, path))
  }
  const when = normalizeLegacyTimestamp(raw.recordedAt)
  if (!when) {
    return ctx.report.skipped.push(skipEntry(kind, raw, 'missing or invalid recordedAt', sectionId, path))
  }

  const text = kind === 'other' ? raw.details : raw.description
  const description = typeof text === 'string' && text.trim() !== '' ? text.trim() : 'Other'
  // Items auto-submitted to a section root carry `from` = folder name.
  const folderNameSnapshot = folderRow
    ? folderRow.name
    : typeof raw.from === 'string' && raw.from !== ''
      ? raw.from
      : null

  const fingerprint = `${sectionId}|${description}|${raw.amount}|${when.recordedAt}`
  const { id, duplicate } = resolveId(ctx, 'transactions', raw.id, fingerprint)
  if (duplicate) {
    ctx.report.duplicatesDropped.push({ kind: 'transaction', id, reason: 'identical transaction id repeated' })
    return
  }
  if (when.approximated) ctx.report.approximatedTimestamps.push({ id, recordedAt: raw.recordedAt })

  ctx.state.transactions.push({
    id,
    sectionId,
    folderId: folderRow ? folderRow.id : null,
    folderNameSnapshot,
    // Legacy rows never stored which checklist produced them, so nothing is linked.
    checklistId: null,
    checklistTitleSnapshot: null,
    description,
    amount: raw.amount,
    transactionType: sectionId, // the legacy section fixed the type
    recordedAt: when.recordedAt,
    transactionDate: when.transactionDate,
    source: kind === 'other' ? 'other' : 'manual',
  })
}

// ------------------------------------------------------- AppState upgrades

// Future schema steps go here: MIGRATIONS[n] upgrades a version-n state to n + 1.
// Version 1 is the first canonical version, so there is nothing to upgrade yet.
const MIGRATIONS = {}

export function upgradeStoredState(state, fromVersion) {
  let current = state
  for (let v = fromVersion; v < SCHEMA_VERSION; v += 1) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(`No migration path from schema version ${v} to ${v + 1}.`)
    current = step(current)
  }
  return { ...current, schemaVersion: SCHEMA_VERSION }
}
