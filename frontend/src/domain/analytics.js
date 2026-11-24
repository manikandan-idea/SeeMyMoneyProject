// Financial analytics for See My Money (Developer 4).
//
// Every function here is a READ-ONLY selector over `state.transactions`.
// Never read from checklists, folders, usage counters or savingAreaEntries
// for money. Income / Expense / Saving are always kept separate; there is no
// combined balance and Saving is never derived as Income - Expense.
//
// Dates: `transactionDate` is a LOCAL calendar date (YYYY-MM-DD) so plain string
// comparison is correct and timezone-safe. Do not use toISOString() for dates.

export const SECTION_IDS = ['income', 'expense', 'saving']

// ---------- date helpers (local calendar) ----------

const pad2 = (n) => String(n).padStart(2, '0')

// Date -> local "YYYY-MM-DD".
export function toLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDateKey = (value) => typeof value === 'string' && DATE_RE.test(value)

// Named periods -> { fromDate, toDate } in local YYYY-MM-DD.
// period: 'today' | 'month' | 'year' | 'all'. `now` is injectable for tests.
export function getPeriodRange(period, now = new Date()) {
  const y = now.getFullYear()
  const m = pad2(now.getMonth() + 1)
  switch (period) {
    case 'today': {
      const d = toLocalDateKey(now)
      return { fromDate: d, toDate: d }
    }
    case 'month': {
      const last = new Date(y, now.getMonth() + 1, 0).getDate()
      return { fromDate: `${y}-${m}-01`, toDate: `${y}-${m}-${pad2(last)}` }
    }
    case 'year':
      return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` }
    default:
      return { fromDate: null, toDate: null }
  }
}

// ---------- internal helpers ----------

function transactionsOf(state) {
  return Array.isArray(state?.transactions) ? state.transactions : []
}

// Positive finite numbers only; anything else contributes nothing.
function amountOf(tx) {
  const n = tx?.amount
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

function hasDateFilter(filters) {
  return isDateKey(filters?.fromDate) || isDateKey(filters?.toDate)
}

// A transaction passes when its local transactionDate lies within the range.
// With an active date filter, rows lacking a transactionDate (legacy data with
// unknown date) are EXCLUDED rather than guessed; with no filter they count.
function inRange(tx, filters) {
  if (!hasDateFilter(filters)) return true
  const date = tx.transactionDate
  if (!isDateKey(date)) return false
  if (isDateKey(filters.fromDate) && date < filters.fromDate) return false
  if (isDateKey(filters.toDate) && date > filters.toDate) return false
  return true
}

// Money type of a transaction: the recorded snapshot, falling back to its section.
function typeOf(tx) {
  return SECTION_IDS.includes(tx.transactionType) ? tx.transactionType : tx.sectionId
}

function emptyTotals() {
  return { income: 0, expense: 0, saving: 0, count: 0 }
}

function addInto(totals, tx) {
  const type = typeOf(tx)
  if (!SECTION_IDS.includes(type)) return
  totals[type] += amountOf(tx)
  totals.count += 1
}

// Avoid floating point dust such as 0.1 + 0.2 in displayed totals.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

function rounded(totals) {
  return {
    ...totals,
    income: round2(totals.income),
    expense: round2(totals.expense),
    saving: round2(totals.saving),
  }
}

// ---------- contract exports ----------

// Total and count of individual transactions in ONE section.
// Section-ROOT convention: recursive - includes every transaction in the section,
// at root and in any nested folder (hidden / settled folders included).
// Extra fields beyond the contract: none.
export function calculateSectionTotals(state, sectionId, filters = {}) {
  let total = 0
  let count = 0
  for (const tx of transactionsOf(state)) {
    if (tx.sectionId !== sectionId || !inRange(tx, filters)) continue
    total += amountOf(tx)
    count += 1
  }
  return { sectionId, total: round2(total), count }
}

// Totals for an OPENED folder.
// Opened-folder convention: DIRECT only - transactions whose folderId is this
// folder; subfolder transactions are excluded (each subfolder shows its own).
// Extra field `recursive` = same shape including every descendant folder, so the
// final roll-up rule can be switched later without changing this module.
// Descendants are found from `state.folders`; a transaction stays attached to a
// folder via its historical folderId even if that folder is later hidden.
export function calculateFolderTotals(state, folderId) {
  const folders = Array.isArray(state?.folders) ? state.folders : []
  const ids = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (!ids.has(f.id) && ids.has(f.parentFolderId)) {
        ids.add(f.id)
        grew = true
      }
    }
  }
  const direct = emptyTotals()
  const recursive = emptyTotals()
  for (const tx of transactionsOf(state)) {
    if (tx.folderId == null) continue
    if (tx.folderId === folderId) addInto(direct, tx)
    if (ids.has(tx.folderId)) addInto(recursive, tx)
  }
  return { ...rounded(direct), recursive: rounded(recursive) }
}

// Separate Income / Expense / Saving totals for all sections within a date range.
export function calculatePeriodTotals(state, filters = {}) {
  const totals = emptyTotals()
  for (const tx of transactionsOf(state)) {
    if (inRange(tx, filters)) addInto(totals, tx)
  }
  return rounded(totals)
}

// Newest first. Ordering uses recordedAt (parsed), then transactionDate; stable
// for ties. Returns the original transaction objects (not copies).
export function getRecentTransactions(state, limit = 5) {
  const stamp = (tx) => {
    const t = Date.parse(tx.recordedAt)
    if (Number.isFinite(t)) return t
    const d = isDateKey(tx.transactionDate) ? Date.parse(`${tx.transactionDate}T00:00`) : NaN
    return Number.isFinite(d) ? d : 0
  }
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5
  return transactionsOf(state)
    .map((tx, index) => ({ tx, index, at: stamp(tx) }))
    .sort((a, b) => b.at - a.at || b.index - a.index)
    .slice(0, max)
    .map((entry) => entry.tx)
}

// ---------- additional (non-contract) exports ----------

// Per-folder breakdown within a section for the Summary page. Groups by the
// transaction's folder snapshot name so deleted/renamed folders still appear.
// Returns [{ key, folderId, name, total, count }] sorted by total desc.
export function calculateFolderBreakdown(state, sectionId, filters = {}) {
  const groups = new Map()
  for (const tx of transactionsOf(state)) {
    if (tx.sectionId !== sectionId || !inRange(tx, filters)) continue
    const folderId = tx.folderId ?? null
    const key = folderId ?? '__root__'
    let g = groups.get(key)
    if (!g) {
      const live = (state.folders || []).find((f) => f.id === folderId)
      g = {
        key,
        folderId,
        name: live?.name ?? tx.folderNameSnapshot ?? 'No folder',
        total: 0,
        count: 0,
      }
      groups.set(key, g)
    }
    g.total += amountOf(tx)
    g.count += 1
  }
  return [...groups.values()]
    .map((g) => ({ ...g, total: round2(g.total) }))
    .sort((a, b) => b.total - a.total)
}

// ---------- folder / page value (what the Spend / Received / Savings boxes show) ----------
//
// ONE rule for every folder card, folder page, floating sheet, Saving Area view and period page:
//
//   value(page or folder) = what its Saving Area holds, nothing else
//     * a checklist entry counts its own amount (or the checklist default) under the checklist's type
//     * a folder entry counts that folder's value (its own Saving Area) once per entry
//
// Nothing is added twice: an inner folder or a checklist that is not in the Saving Area adds
// nothing, and a folder is never counted both as itself and as an entry. Because this is derived
// from the current state on every render, any change (amount edited, record added or removed,
// inner folder changed) shows in the card, in every parent folder and on the page at once.
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const emptyValue = () => ({ income: 0, expense: 0, saving: 0 })

function addValue(out, v) {
  out.income += v.income
  out.expense += v.expense
  out.saving += v.saving
}

// Records box of a checklist row = starting records + recorded transactions + entries added.
export function checklistRecordCount(state, checklist) {
  const id = checklist.id
  const recorded = transactionsOf(state).filter((t) => t.checklistId === id).length
  const added = (state?.savingAreaEntries ?? []).filter((e) => e.sourceType === 'checklist' && e.sourceId === id).length
  return (checklist.baseRecord ?? 0) + recorded + added
}

// Records of an inner folder inside `parentId`: the records added to the Saving Area, or (none added yet) its own record count.
export function folderRecordCount(state, folder, parentId = folder.parentFolderId) {
  const added = folderItemEntries(state, folder, parentId).length
  return added > 0 ? added : (folder.recordCount ?? 1) // what the Records box shows = how many times it counts
}

// Entries in `ownerId`'s Saving Area that are copies of `folder` ("+ Add item" / "+ Edit" taps).
export function folderItemEntries(state, folder, ownerId) {
  const folders = state?.folders ?? []
  return (state?.savingAreaEntries ?? []).filter((e) => {
    if (e.ownerFolderId !== ownerId || e.sourceType !== 'folder') return false
    if (e.sourceId === folder.id) return true
    return folders.find((f) => f.id === e.sourceId)?.copiedFrom === folder.id
  })
}

function valueOf(state, ownerId, seen) {
  const out = emptyValue()
  if (seen.has(ownerId)) return out // safety: never loop
  const next = new Set(seen).add(ownerId)
  // A FOLDER also counts the folders inside it by their Records box (a page does not):
  // an inner folder counts `Records` times (default 1) until you add it to this folder's Saving
  // Area with "+ Add item" / "+ Edit"; from then on only the records you added count, so
  // nothing is ever counted twice.
  if (!String(ownerId).startsWith('page:')) {
    for (const k of state?.folders ?? []) {
      if (k.parentFolderId !== ownerId || k.hidden || k.savingCopy) continue
      if (folderItemEntries(state, k, ownerId).length > 0) continue
      const v = valueOf(state, k.id, next)
      const times = k.recordCount ?? 1
      out.income += v.income * times
      out.expense += v.expense * times
      out.saving += v.saving * times
    }
  }
  for (const e of state?.savingAreaEntries ?? []) {
    if (e.ownerFolderId !== ownerId) continue
    if (e.sourceType === 'checklist') {
      // the entry carries its own snapshot; the checklist is only a fallback for very old entries
      const c = (state.checklists ?? []).find((x) => x.id === e.sourceId)
      const type = e.transactionType ?? c?.transactionType
      if (out[type] !== undefined) out[type] += Number(e.amount ?? c?.defaultAmount) || 0
    } else {
      const f = (state.folders ?? []).find((x) => x.id === e.sourceId)
      if (f && !f.hidden) addValue(out, valueOf(state, f.id, next))
    }
  }
  return out
}

// Value of a page or folder (see the rule above). Same shape as calculateFolderTotals().
export function calculateOwnerValue(state, ownerId) {
  const v = valueOf(state, ownerId, new Set())
  return { income: round(v.income), expense: round(v.expense), saving: round(v.saving) }
}

// What a folder card / folder page shows: the same numbers everywhere.
export function calculateFolderView(state, folderId) {
  return calculateOwnerValue(state, folderId)
}
