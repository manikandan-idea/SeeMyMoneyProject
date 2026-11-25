// Developer 2 — pure folder / checklist-template / Saving Area operations.
//
// Every write operation takes an AppState and returns a NEW AppState (the input
// is never mutated). Invalid input throws an Error with a readable message —
// the UI validates first, so a throw means a programming error, not user error.
//
// This module never reads or writes `transactions`. Money recording and
// transaction deletion belong to Developer 3.

const SECTION_IDS = ['income', 'expense', 'saving']
const USAGES = ['daily', 'monthly', 'yearly', 'occasional']
const OCCASIONAL_FREQUENCIES = ['once', 'multiple']
const CHECKLIST_FREQUENCIES = ['daily', 'monthly', 'yearly']
const SAVING_SOURCE_TYPES = ['checklist', 'folder']

// Every period page (Today / This Month / This Year / Infrequent Items) is treated
// as a folder, so it can own a Saving Area too. These ids are "virtual page folders":
// they are not stored in `folders`, only used as `ownerFolderId`.
import { hashString } from './hash.js'

export const PAGE_OWNER_IDS = ['page:daily', 'page:monthly', 'page:yearly', 'page:occasional']
export const isPageOwner = (id) => PAGE_OWNER_IDS.includes(id)
export function pageOwnerId(usage) {
  return `page:${usage}`
}

// ---------- small helpers ----------

export function makeId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso() {
  return new Date().toISOString()
}

// Local calendar period key (NOT the UTC substring of toISOString()).
//   daily -> YYYY-MM-DD, monthly -> YYYY-MM, yearly -> YYYY, otherwise null.
export function periodKeyFor(usage, date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  if (usage === 'daily') return `${year}-${month}-${day}`
  if (usage === 'monthly') return `${year}-${month}`
  if (usage === 'yearly') return String(year)
  return null
}

// Insert `item` right after the item with id `afterId` (a twin / copy sits directly
// below its original). Unknown or missing afterId -> appended at the end.
function insertAfter(list, item, afterId) {
  const i = afterId ? list.findIndex((x) => x.id === afterId) : -1
  if (i === -1) return [...list, item]
  return [...list.slice(0, i + 1), item, ...list.slice(i + 1)]
}

// Optional caller-chosen id (lets the UI remember what it created so it can undo it).
function chosenId(state, list, id, label) {
  if (id === undefined || id === null || id === '') return makeId()
  if (typeof id !== 'string') throw new Error(`${label} id must be a string.`)
  if (list.some((x) => x.id === id)) throw new Error(`${label} id \"${id}\" already exists.`)
  return id
}

// "Record count" (Advanced settings of the creation forms): whole number 1..999.
// Stored only when it is not the default 1; read it as `item.recordCount ?? 1`.
function recordCountField(value) {
  if (value === undefined || value === null) return {}
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new Error('Record count must be a whole number from 1 to 999.')
  }
  return value === 1 ? {} : { recordCount: value }
}

function isPositiveAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function cleanText(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function requireSection(state, sectionId) {
  if (!SECTION_IDS.includes(sectionId) || !state.sections.some((s) => s.id === sectionId)) {
    throw new Error(`Unknown section "${sectionId}".`)
  }
}

function requireFolder(state, folderId) {
  const folder = state.folders.find((f) => f.id === folderId)
  if (!folder) throw new Error(`Folder "${folderId}" does not exist.`)
  return folder
}

function requireChecklist(state, checklistId) {
  const checklist = state.checklists.find((c) => c.id === checklistId)
  if (!checklist) throw new Error(`Checklist "${checklistId}" does not exist.`)
  return checklist
}

// Normalise usage + frequency together: frequency only exists for occasional folders.
function normaliseUsage(usage, frequency) {
  if (usage === undefined || usage === null || usage === '') return { usage: null, frequency: null }
  if (!USAGES.includes(usage)) throw new Error(`Invalid folder usage "${usage}".`)
  if (usage !== 'occasional') return { usage, frequency: null }
  if (!OCCASIONAL_FREQUENCIES.includes(frequency)) {
    throw new Error('An occasional folder needs frequency "once" or "multiple".')
  }
  return { usage, frequency }
}

// A checklist's frequency comes from the page/context (the folder's usage).
function frequencyFromFolder(folder) {
  return CHECKLIST_FREQUENCIES.includes(folder.usage) ? folder.usage : null
}

function resolveChecklistFrequency(folder, supplied) {
  if (supplied === undefined) return frequencyFromFolder(folder)
  if (supplied === null) return null
  if (!CHECKLIST_FREQUENCIES.includes(supplied)) {
    throw new Error(`Invalid checklist frequency "${supplied}".`)
  }
  return supplied
}

function resolveTransactionType(folder, supplied) {
  if (supplied === undefined || supplied === null || supplied === '') return folder.sectionId
  if (!SECTION_IDS.includes(supplied)) throw new Error(`Invalid transaction type "${supplied}".`)
  return supplied
}

function buildChecklist(folder, input, at, id = makeId()) {
  return {
    id,
    sectionId: folder.sectionId,
    folderId: folder.id,
    title: cleanText(input.title, 'Checklist title'),
    defaultAmount: (() => {
      if (!isPositiveAmount(input.defaultAmount)) {
        throw new Error('Default amount must be a number greater than 0.')
      }
      return input.defaultAmount
    })(),
    transactionType: resolveTransactionType(folder, input.transactionType),
    frequency: resolveChecklistFrequency(folder, input.frequency),
    ...recordCountField(input.recordCount),
    // A checklist made in a folder starts with 1 record (no money recorded). Records box =
    // baseRecord + recorded transactions; at 0 the checklist is deleted (trash at 1 record).
    ...(Number.isInteger(input.baseRecord) && input.baseRecord >= 1 && input.baseRecord <= 999 ? { baseRecord: input.baseRecord } : {}),
    createdAt: at,
    updatedAt: at,
  }
}

// ---------- folders ----------

// input: { sectionId, parentFolderId, name, usage, frequency, othersEnabled,
//          checklist? }
// `checklist` is an OPTIONAL additive field: [{ title, defaultAmount }] — it lets
// the "New folder" form create the folder and its first reusable checklists in a
// single commit. Omit it for the exact contract shape.
// Other OPTIONAL additive fields: `id` (caller-chosen, for undo), `afterFolderId`
// (insert right below that sibling, used by "+ Edit" twins) and `recordCount`.
export function createFolder(state, input) {
  const { sectionId, parentFolderId = null } = input
  requireSection(state, sectionId)
  if (parentFolderId !== null) {
    const parent = requireFolder(state, parentFolderId)
    if (parent.sectionId !== sectionId) {
      throw new Error('A folder must be created in the same section as its parent folder.')
    }
  }
  const { usage, frequency } = normaliseUsage(input.usage, input.frequency)
  const at = nowIso()
  const folder = {
    id: chosenId(state, state.folders, input.id, 'Folder'),
    sectionId,
    parentFolderId,
    name: cleanText(input.name, 'Folder name'),
    usage,
    frequency,
    othersEnabled: Boolean(input.othersEnabled),
    hidden: false,
    periodKey: periodKeyFor(usage),
    ...recordCountField(input.recordCount),
    createdAt: at,
    updatedAt: at,
  }
  const checklists = (input.checklist || []).map((row) => buildChecklist(folder, row, at))
  return {
    ...state,
    folders: insertAfter(state.folders, folder, input.afterFolderId),
    checklists: [...state.checklists, ...checklists],
  }
}

const FOLDER_PATCH_FIELDS = ['name', 'usage', 'frequency', 'othersEnabled']

// Only name / usage / frequency / othersEnabled can change. Identity, section,
// parent, hidden and timestamps are not patchable here (use setFolderHidden).
export function updateFolder(state, folderId, patch) {
  const folder = requireFolder(state, folderId)
  const next = { ...folder }
  for (const key of FOLDER_PATCH_FIELDS) {
    if (patch && Object.hasOwn(patch, key)) next[key] = patch[key]
  }
  next.name = cleanText(next.name, 'Folder name')
  next.othersEnabled = Boolean(next.othersEnabled)
  const usageChanged = patch && (Object.hasOwn(patch, 'usage') || Object.hasOwn(patch, 'frequency'))
  if (usageChanged) {
    const normalised = normaliseUsage(next.usage, next.frequency)
    next.usage = normalised.usage
    next.frequency = normalised.frequency
    if (normalised.usage !== folder.usage) next.periodKey = periodKeyFor(normalised.usage)
  }
  next.updatedAt = nowIso()
  return { ...state, folders: state.folders.map((f) => (f.id === folderId ? next : f)) }
}

// Hide / restore. Touches only the folder row — never transactions, checklists
// or Saving Area entries.
export function setFolderHidden(state, folderId, hidden) {
  const folder = requireFolder(state, folderId)
  const flag = Boolean(hidden)
  if (folder.hidden === flag) return state
  const next = { ...folder, hidden: flag, updatedAt: nowIso() }
  return { ...state, folders: state.folders.map((f) => (f.id === folderId ? next : f)) }
}

// "Add again": copy reusable STRUCTURE only, as a sibling of the original.
// Copies the folder, its inner folders (recursively) and their checklist
// templates with brand-new IDs. Never copies transactions or Saving Area
// entries; copies are visible (hidden:false) and start with fresh period keys.
export function duplicateFolderStructure(state, folderId) {
  const original = requireFolder(state, folderId)
  const at = nowIso()
  const newFolders = []
  const newChecklists = []

  function copy(folder, parentFolderId) {
    const copyId = makeId()
    newFolders.push({
      ...folder,
      id: copyId,
      parentFolderId,
      hidden: false,
      periodKey: periodKeyFor(folder.usage),
      createdAt: at,
      updatedAt: at,
    })
    for (const checklist of state.checklists) {
      if (checklist.folderId !== folder.id) continue
      newChecklists.push({ ...checklist, id: makeId(), folderId: copyId, createdAt: at, updatedAt: at })
    }
    for (const child of state.folders) {
      if (child.parentFolderId === folder.id) copy(child, copyId)
    }
  }

  copy(original, original.parentFolderId)
  return {
    ...state,
    folders: [...state.folders, ...newFolders],
    checklists: [...state.checklists, ...newChecklists],
  }
}

// ---------- checklist templates ----------

// input: { sectionId, folderId, title, defaultAmount, transactionType, frequency }
// transactionType defaults to the folder's section; frequency defaults to the
// folder's usage when that is daily/monthly/yearly (the page already says so).
// OPTIONAL additive fields: `id` (caller-chosen, for undo), `afterChecklistId`
// (insert right below that checklist: "Other" adds a same-name row below) and
// `recordCount`.
export function createChecklistTemplate(state, input) {
  // A checklist placed directly on a period page has no folder (folderId null).
  // Its section follows the chosen type (Spend=expense, Received=income, Savings=saving).
  if (input.folderId === undefined || input.folderId === null) {
    const type = resolveTransactionType({ sectionId: input.sectionId || 'expense' }, input.transactionType || input.sectionId)
    requireSection(state, type)
    const pseudo = { id: null, sectionId: type, usage: input.frequency ?? null }
    const rootId = chosenId(state, state.checklists, input.id, 'Checklist')
    const root = buildChecklist(pseudo, { ...input, transactionType: type, frequency: input.frequency ?? null }, nowIso(), rootId)
    return { ...state, checklists: insertAfter(state.checklists, root, input.afterChecklistId) }
  }
  const folder = requireFolder(state, input.folderId)
  if (input.sectionId !== undefined && input.sectionId !== folder.sectionId) {
    throw new Error('Checklist sectionId must match its folder\'s section.')
  }
  const checklist = buildChecklist(folder, input, nowIso(), chosenId(state, state.checklists, input.id, 'Checklist'))
  return { ...state, checklists: insertAfter(state.checklists, checklist, input.afterChecklistId) }
}

// Puts back a template that was removed (undo / redo). Same id, same position.
// No-op when it already exists or its folder is gone.
export function restoreChecklistTemplate(state, checklist, index) {
  if (!checklist || typeof checklist.id !== 'string') return state
  if (state.checklists.some((c) => c.id === checklist.id)) return state
  if (checklist.folderId && !state.folders.some((f) => f.id === checklist.folderId)) return state
  const at = Number.isInteger(index) ? Math.min(Math.max(index, 0), state.checklists.length) : state.checklists.length
  return {
    ...state,
    checklists: [...state.checklists.slice(0, at), checklist, ...state.checklists.slice(at)],
  }
}

const CHECKLIST_PATCH_FIELDS = ['title', 'defaultAmount', 'transactionType', 'frequency']

// Changes the reusable template only — i.e. FUTURE recordings. Existing
// transactions and Saving Area entry snapshots are left exactly as they are.
export function updateChecklistTemplate(state, checklistId, patch) {
  const checklist = requireChecklist(state, checklistId)
  const folder = checklist.folderId
    ? requireFolder(state, checklist.folderId)
    : { id: null, sectionId: checklist.sectionId, usage: checklist.frequency }
  const next = { ...checklist }
  for (const key of CHECKLIST_PATCH_FIELDS) {
    if (patch && Object.hasOwn(patch, key)) next[key] = patch[key]
  }
  next.title = cleanText(next.title, 'Checklist title')
  if (!isPositiveAmount(next.defaultAmount)) {
    throw new Error('Default amount must be a number greater than 0.')
  }
  next.transactionType = resolveTransactionType(folder, next.transactionType)
  next.frequency = resolveChecklistFrequency(folder, next.frequency)
  next.updatedAt = nowIso()
  return { ...state, savingAreaEntries: freezeEntries(state, checklist), checklists: state.checklists.map((c) => (c.id === checklistId ? next : c)) }
}

// Older entries that never stored their own amount / type keep the values the checklist has NOW,
// so a later edit or delete of the checklist cannot change them.
function freezeEntries(state, checklist) {
  const needs = (e) => e.sourceType === 'checklist' && e.sourceId === checklist.id && (e.amount === undefined || e.transactionType === undefined)
  if (!state.savingAreaEntries.some(needs)) return state.savingAreaEntries
  return state.savingAreaEntries.map((e) => (
    e.sourceType === 'checklist' && e.sourceId === checklist.id && (e.amount === undefined || e.transactionType === undefined)
      ? (() => {
        const amount = e.amount ?? checklist.defaultAmount
        const transactionType = e.transactionType ?? checklist.transactionType
        return { ...e, amount, transactionType, hash: entryHash(e.titleSnapshot, transactionType, amount) }
      })()
      : e
  ))
}

// Removes ONLY the reusable template. `transactions` and `savingAreaEntries`
// are passed through untouched (same array references). Unknown id: no-op.
export function deleteChecklistTemplate(state, checklistId) {
  if (!state.checklists.some((c) => c.id === checklistId)) return state
  const gone = state.checklists.find((c) => c.id === checklistId)
  return { ...state, savingAreaEntries: freezeEntries(state, gone), checklists: state.checklists.filter((c) => c.id !== checklistId) }
}

// ---------- Saving Area ----------

// input: { sectionId, ownerFolderId, sourceType, sourceId }
// Every call appends ONE new SavingAreaEntry (own id). The source checklist /
// folder is not changed. Repeated adds make separate rows (never a counter).
// Not a transaction — `transactions` is never touched.
// ---------- fingerprints (content hashes) ----------
// Every checklist and folder has a fingerprint of what is INSIDE it (names, amounts, types,
// settings, and everything nested). Ids and dates are not part of it. Same content -> same hash;
// any edit -> a different hash. The Saving Area uses it to tell "the same thing again" from
// "something that has changed since".
const norm = (v) => (v === undefined || v === null ? '' : v)

// a checklist record in a Saving Area: its title, type and amount
export function entryHash(title, transactionType, amount) {
  return hashString(JSON.stringify(['k', String(norm(title)).trim(), norm(transactionType), Number(amount) || 0]))
}

export function hashChecklist(checklist) {
  return hashString(JSON.stringify([
    'c', String(norm(checklist.title)).trim(), norm(checklist.transactionType),
    Number(checklist.defaultAmount) || 0, Number(checklist.baseRecord) || 0,
  ]))
}

export function hashFolder(state, folderId, seen = new Set()) {
  const folder = state.folders.find((f) => f.id === folderId)
  if (!folder || seen.has(folderId)) return hashString('missing')
  const next = new Set(seen).add(folderId)
  const lists = state.checklists.filter((c) => c.folderId === folderId).map(hashChecklist).sort()
  const kids = state.folders.filter((f) => f.parentFolderId === folderId && !f.hidden).map((f) => hashFolder(state, f.id, next)).sort()
  const records = state.savingAreaEntries.filter((e) => e.ownerFolderId === folderId).map((e) => (
    e.sourceType === 'checklist'
      ? (e.hash ?? entryHash(e.titleSnapshot, e.transactionType, e.amount))
      : hashFolder(state, e.sourceId, next)
  )).sort()
  return hashString(JSON.stringify([
    'f', String(norm(folder.name)).trim(), norm(folder.usage), norm(folder.frequency),
    folder.recordCount ?? 1, Boolean(folder.othersEnabled), lists, kids, records,
  ]))
}

// Adding to a Saving Area always puts a separate, independent item there (a snapshot):
//  * a checklist record stores its own title, type and amount;
//  * a folder is a fresh deep copy (its own checklists, folders and records).
// After that, editing / deleting the original never touches what is already in the Saving Area,
// and the Saving Area never touches the original. If the thing being added has the SAME
// fingerprint as something already in this Saving Area, it is that same item again (count +1);
// if anything differs, it is a new item, even with the same name.
export function addSavingAreaEntry(state, input) {
  if (input.cloneOf) { // "+" on a Saving Area row: one more of exactly that record
    const src = state.savingAreaEntries.find((e) => e.id === input.cloneOf)
    if (!src) throw new Error('Saving Area entry to repeat does not exist.')
    const id = input.id && !state.savingAreaEntries.some((e) => e.id === input.id) ? input.id : makeId()
    return { ...state, savingAreaEntries: [...state.savingAreaEntries, { ...src, id, addedAt: nowIso() }] }
  }
  if (input.sourceType === 'folder') {
    const source = requireFolder(state, input.sourceId)
    if (input.sourceId === input.ownerFolderId) throw new Error('A folder cannot be added to its own Saving Area.')
    const wanted = hashFolder(state, source.id)
    const same = state.savingAreaEntries.find((e) => (
      e.ownerFolderId === input.ownerFolderId && e.sourceType === 'folder'
      && state.folders.some((f) => f.id === e.sourceId) && hashFolder(state, e.sourceId) === wanted
    ))
    if (same) return addEntryDirect(state, { ...input, sourceId: same.sourceId }) // the same folder again
    return copyFolderToSavingArea(state, { folderId: source.id, ownerFolderId: input.ownerFolderId, entryId: input.id, sectionId: input.sectionId })
  }
  return addEntryDirect(state, input)
}

// "+ Edit" copy finished: if it ended up identical to a folder already in this Saving Area, it IS
// that folder: merge them (the entry points at the existing one and the extra copy is removed).
export function mergeIdenticalCopy(state, ownerFolderId, copyId) {
  const mine = state.savingAreaEntries.find((e) => e.ownerFolderId === ownerFolderId && e.sourceType === 'folder' && e.sourceId === copyId)
  if (!mine || !state.folders.some((f) => f.id === copyId)) return state
  const wanted = hashFolder(state, copyId)
  const twin = state.savingAreaEntries.find((e) => (
    e.ownerFolderId === ownerFolderId && e.sourceType === 'folder' && e.sourceId !== copyId
    && state.folders.some((f) => f.id === e.sourceId) && hashFolder(state, e.sourceId) === wanted
  ))
  if (!twin) return state
  const removed = removeSavingAreaEntry(state, mine.id) // also removes the now-unused copy
  return addEntryDirect(removed, { ownerFolderId, sourceType: 'folder', sourceId: twin.sourceId, id: mine.id })
}

function addEntryDirect(state, input) {
  const pageOwned = isPageOwner(input.ownerFolderId)
  const owner = pageOwned ? { id: input.ownerFolderId, sectionId: null } : requireFolder(state, input.ownerFolderId)
  if (!pageOwned && input.sectionId !== undefined && input.sectionId !== owner.sectionId) {
    throw new Error('Saving Area entry sectionId must match the owner folder\'s section.')
  }
  if (!SAVING_SOURCE_TYPES.includes(input.sourceType)) {
    throw new Error(`Invalid Saving Area source type "${input.sourceType}".`)
  }
  let titleSnapshot
  if (input.sourceType === 'checklist') {
    const source = requireChecklist(state, input.sourceId)
    if (!pageOwned && source.sectionId !== owner.sectionId) throw new Error('Source must be in the same section.')
    if (pageOwned) owner.sectionId = source.sectionId
    titleSnapshot = source.title
  } else {
    const source = requireFolder(state, input.sourceId)
    if (source.id === owner.id) throw new Error('A folder cannot be added to its own Saving Area.')
    if (!pageOwned && source.sectionId !== owner.sectionId) throw new Error('Source must be in the same section.')
    if (pageOwned) owner.sectionId = source.sectionId
    titleSnapshot = source.name
  }
  const entry = {
    id: input.id && !state.savingAreaEntries.some((e) => e.id === input.id) ? input.id : makeId(),
    sectionId: owner.sectionId,
    ownerFolderId: owner.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    titleSnapshot,
    ...(input.sourceType === 'checklist' ? checklistSnapshot(state, input) : {}),
    addedAt: nowIso(),
  }
  return { ...state, savingAreaEntries: [...state.savingAreaEntries, entry] }
}

function checklistSnapshot(state, input) {
  const c = requireChecklist(state, input.sourceId)
  const amount = Number(input.amount) > 0 ? Number(input.amount) : c.defaultAmount
  const value = Math.round(Number(amount) * 100) / 100
  return { amount: value, transactionType: c.transactionType, hash: entryHash(c.title, c.transactionType, value) }
}


// "+ Edit" on a page folder: makes an independent COPY of the folder (inner folders and
// checklist templates, new ids, no transactions) and puts it into `ownerFolderId`'s
// Saving Area as one entry. The original is never touched. The copy is flagged
// `savingCopy` so it never shows up as a normal folder on a page / in a section tree;
// it lives only in the Saving Area. input: { folderId, ownerFolderId, id? }
export function copyFolderToSavingArea(state, input) {
  const original = requireFolder(state, input.folderId)
  const at = nowIso()
  const rootId = chosenId(state, state.folders, input.id, 'Folder')
  const newFolders = []
  const newChecklists = []
  const folderMap = new Map() // old folder id -> copy id
  const checklistMap = new Map()
  function copy(folder, id, parentFolderId, root, origin) {
    folderMap.set(folder.id, id)
    newFolders.push({
      ...folder, id, parentFolderId, hidden: false,
      ...(root ? { savingCopy: true, copiedFrom: origin } : { copiedFrom: undefined }),
      createdAt: at, updatedAt: at,
    })
    for (const c of state.checklists) {
      if (c.folderId === folder.id) {
        const cid = makeId()
        checklistMap.set(c.id, cid)
        newChecklists.push({ ...c, id: cid, folderId: id, createdAt: at, updatedAt: at })
      }
    }
    for (const child of state.folders) {
      if (child.parentFolderId === folder.id && !child.hidden) copy(child, makeId(), id, false)
    }
  }
  const originOf = (f) => f.copiedFrom ?? f.id
  copy(original, rootId, null, true, originOf(original))
  // Whole-folder entries inside the copied tree point at other Saving Area copies: copy those too,
  // so the new copy shares nothing with anything else.
  for (let grew = true; grew;) {
    grew = false
    for (const e of state.savingAreaEntries) {
      if (!folderMap.has(e.ownerFolderId) || e.sourceType !== 'folder' || folderMap.has(e.sourceId)) continue
      const src = state.folders.find((f) => f.id === e.sourceId)
      if (!src) continue
      // keep the link to the matching inner folder of the NEW tree, so its Records box stays right
      copy(src, makeId(), null, true, folderMap.get(originOf(src)) ?? originOf(src))
      grew = true
    }
  }
  // the copy starts with the same Saving Area entries as the original (re-pointed at the copies)
  const newEntries = state.savingAreaEntries
    .filter((e) => folderMap.has(e.ownerFolderId))
    .map((e) => ({
      ...e,
      id: makeId(),
      ownerFolderId: folderMap.get(e.ownerFolderId),
      sourceId: e.sourceType === 'checklist' ? (checklistMap.get(e.sourceId) ?? e.sourceId) : (folderMap.get(e.sourceId) ?? e.sourceId),
    }))
  const withCopy = {
    ...state,
    folders: [...state.folders, ...newFolders.map((f) => (f.copiedFrom === undefined ? (({ copiedFrom, ...rest }) => rest)(f) : f))],
    checklists: [...state.checklists, ...newChecklists],
    savingAreaEntries: [...state.savingAreaEntries, ...newEntries],
  }
  return addEntryDirect(withCopy, {
    ownerFolderId: input.ownerFolderId, sourceType: 'folder', sourceId: rootId,
    ...(input.entryId ? { id: input.entryId } : {}),
  })
}
export function updateSavingAreaEntryAmount(state, entryIds, amount) {
  if (!(Number(amount) > 0)) throw new Error('Amount must be a number greater than 0.')
  const ids = new Set(entryIds)
  const value = Math.round(Number(amount) * 100) / 100
  return {
    ...state,
    savingAreaEntries: state.savingAreaEntries.map((e) => (ids.has(e.id) && e.sourceType === 'checklist' ? { ...e, amount: value, hash: entryHash(e.titleSnapshot, e.transactionType, value) } : e)),
  }
}

// Puts a removed entry back (undo / redo in the Saving Area folder view), together with the
// Saving Area copy it pointed at when that copy went with it (`tree` from collectEntryTree).
// No-op when it exists or its source is gone.
export function restoreSavingAreaEntry(state, entry, tree = null) {
  if (!entry || state.savingAreaEntries.some((e) => e.id === entry.id)) return state
  let next = state
  if (tree) {
    const has = (list, id) => list.some((x) => x.id === id)
    next = {
      ...state,
      folders: [...state.folders, ...tree.folders.filter((f) => !has(state.folders, f.id))],
      checklists: [...state.checklists, ...tree.checklists.filter((c) => !has(state.checklists, c.id))],
      savingAreaEntries: [...state.savingAreaEntries, ...tree.entries.filter((e) => !has(state.savingAreaEntries, e.id))],
    }
  }
  const sourceOk = entry.sourceType === 'checklist'
    ? true // a checklist entry carries its own snapshot, so it never needs the original
    : next.folders.some((f) => f.id === entry.sourceId)
  if (!sourceOk) return state
  return { ...next, savingAreaEntries: [...next.savingAreaEntries, entry] }
}

// Removing the LAST entry that points at a Saving Area copy also removes the copy (its folders,
// checklists and own entries): it only exists for that entry. This returns exactly what would go,
// so undo can bring it back.
export function collectEntryTree(state, entry) {
  const copy = entry?.sourceType === 'folder' ? state.folders.find((f) => f.id === entry.sourceId) : null
  const others = state.savingAreaEntries.filter((e) => e.id !== entry?.id)
  if (!copy?.savingCopy || others.some((e) => e.sourceType === 'folder' && e.sourceId === copy.id)) return null
  const gone = new Set([copy.id])
  for (let grew = true; grew;) {
    grew = false
    for (const f of state.folders) if (f.parentFolderId && gone.has(f.parentFolderId) && !gone.has(f.id)) { gone.add(f.id); grew = true }
  }
  // copies referenced by entries inside the tree go with it, unless something else still uses them
  for (let grew = true; grew;) {
    grew = false
    for (const e of others) {
      if (!gone.has(e.ownerFolderId) || e.sourceType !== 'folder' || gone.has(e.sourceId)) continue
      const sub = state.folders.find((f) => f.id === e.sourceId)
      const stillUsed = others.some((x) => !gone.has(x.ownerFolderId) && x.sourceType === 'folder' && x.sourceId === e.sourceId)
      if (sub?.savingCopy && !stillUsed) {
        gone.add(sub.id)
        for (const f of state.folders) if (f.parentFolderId === sub.id) gone.add(f.id)
        grew = true
      }
    }
  }
  return {
    folders: state.folders.filter((f) => gone.has(f.id)),
    checklists: state.checklists.filter((c) => gone.has(c.folderId)),
    entries: state.savingAreaEntries.filter((e) => gone.has(e.ownerFolderId)),
  }
}

export function removeSavingAreaEntry(state, entryId) {
  const entry = state.savingAreaEntries.find((e) => e.id === entryId)
  if (!entry) throw new Error(`Saving Area entry "${entryId}" does not exist.`)
  const tree = collectEntryTree(state, entry)
  const next = { ...state, savingAreaEntries: state.savingAreaEntries.filter((e) => e.id !== entryId) }
  if (!tree) return next
  const gone = new Set(tree.folders.map((f) => f.id))
  return {
    ...next,
    folders: next.folders.filter((f) => !gone.has(f.id)),
    checklists: next.checklists.filter((c) => !gone.has(c.folderId)),
    savingAreaEntries: next.savingAreaEntries.filter((e) => !gone.has(e.ownerFolderId)),
  }
}

export function groupSavingAreaEntries(entries) {
  const groups = new Map()
  for (const entry of entries) {
    // entries with their own amount form a separate row per amount
    const key = entry.hash ? `${entry.sourceType}:h:${entry.hash}` : `${entry.sourceType}:${entry.sourceId}${entry.amount !== undefined ? `:${entry.amount}` : ''}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        titleSnapshot: entry.titleSnapshot,
        ...(entry.amount !== undefined ? { amount: entry.amount } : {}),
        count: 0,
        entries: [],
      })
    }
    const group = groups.get(key)
    group.count += 1
    group.entries.push(entry)
  }
  return [...groups.values()]
}

// Safe movement primitive: reassign every entry owned by sourceFolderId to
// targetFolderId (same entry ids, same order). Validates the target BEFORE any
// change. Repeating the call finds nothing left in the source and returns the
// same state, so there are never duplicates. Folders, checklists and
// transactions are untouched.
// Which folder is the "next period" target is a UI/workflow decision that is
// not defined yet — see HANDOFF.md.
export function settleSavingAreaEntries(state, { sourceFolderId, targetFolderId }) {
  const target = isPageOwner(targetFolderId) ? { id: targetFolderId, sectionId: null } : requireFolder(state, targetFolderId)
  if (sourceFolderId === targetFolderId) return state
  const source = state.folders.find((f) => f.id === sourceFolderId)
  if (source && target.sectionId && source.sectionId !== target.sectionId) {
    throw new Error('Settlement target must be in the same section as the source folder.')
  }
  if (!state.savingAreaEntries.some((e) => e.ownerFolderId === sourceFolderId)) return state
  return {
    ...state,
    savingAreaEntries: state.savingAreaEntries.map((entry) =>
      entry.ownerFolderId === sourceFolderId ? { ...entry, ownerFolderId: targetFolderId } : entry,
    ),
  }
}

// Tree for one section. Hidden folders ARE included (check `.hidden`).
// Returns { sectionId, folders: Node[], byId: { [folderId]: Node } } where
//   Node = { ...folder, path: [ids from top to this folder], folders: Node[],
//            checklists: ChecklistTemplate[], savingAreaEntries: SavingAreaEntry[] }
// `path` makes opening a folder a view of the SAME entity (no copy is created).
export function selectFolderTree(state, sectionId) {
  const inSection = state.folders.filter((f) => f.sectionId === sectionId)
  const byId = {}
  for (const folder of inSection) {
    byId[folder.id] = {
      ...folder,
      path: [],
      folders: [],
      checklists: state.checklists.filter((c) => c.folderId === folder.id),
      savingAreaEntries: state.savingAreaEntries.filter((e) => e.ownerFolderId === folder.id),
    }
  }
  const top = []
  for (const folder of inSection) {
    const node = byId[folder.id]
    const parent = folder.parentFolderId ? byId[folder.parentFolderId] : null
    if (parent) parent.folders.push(node)
    else if (!folder.savingCopy) top.push(node) // top-level (or orphan); Saving Area copies live only there
  }
  const stamp = (node, path) => {
    node.path = [...path, node.id]
    node.folders.forEach((child) => stamp(child, node.path))
  }
  top.forEach((node) => stamp(node, []))
  return { sectionId, folders: top, byId }
}

// Every hidden folder across all sections, with its readable ancestor names.
// Returns [{ folder, sectionId, names: ['Business','Projects'] }].
export function selectHiddenFolders(state) {
  const byId = new Map(state.folders.map((f) => [f.id, f]))
  const out = []
  for (const folder of state.folders) {
    if (!folder.hidden) continue
    const names = []
    const seen = new Set()
    let cursor = folder
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      names.unshift(cursor.name)
      cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : null
    }
    out.push({ folder, sectionId: folder.sectionId, names })
  }
  return out
}

// ---------- Quick add ----------
// A one-off checklist record put straight into a page's / folder's Saving Area. It is NOT a
// checklist template (nothing is added to the Checklists list or any container): the record
// carries its own name, type and amount. `records` identical records are added; identical
// records group into one row (same fingerprint). `ids` lets undo / redo reuse the same ids.
export function quickAddAutoName(state, ownerFolderId) {
  const used = new Set(state.savingAreaEntries.filter((e) => e.ownerFolderId === ownerFolderId).map((e) => e.titleSnapshot))
  let n = 1
  while (used.has(`Checklist ${n}`)) n += 1
  return `Checklist ${n}`
}

export function addQuickEntries(state, input) {
  const amount = Number(String(input.amount).replace(/,/g, ''))
  if (!(Number.isFinite(amount) && amount > 0)) throw new Error('Amount must be a number greater than 0.')
  const records = input.records === undefined ? 1 : Number(input.records)
  if (!Number.isInteger(records) || records < 1) throw new Error('Records must be a whole number of 1 or more.')
  if (!SECTION_IDS.includes(input.transactionType)) throw new Error(`Invalid type "${input.transactionType}".`)
  const pageOwned = isPageOwner(input.ownerFolderId)
  const owner = pageOwned ? null : requireFolder(state, input.ownerFolderId)
  const value = Math.round(amount * 100) / 100
  const name = String(input.name ?? '').trim() || quickAddAutoName(state, input.ownerFolderId)
  const sourceId = `quick:${makeId()}`
  const at = nowIso()
  const added = Array.from({ length: records }, (_, i) => ({
    id: input.ids?.[i] && !state.savingAreaEntries.some((e) => e.id === input.ids[i]) ? input.ids[i] : makeId(),
    sectionId: owner ? owner.sectionId : input.transactionType,
    ownerFolderId: input.ownerFolderId,
    sourceType: 'checklist',
    sourceId,
    titleSnapshot: name,
    amount: value,
    transactionType: input.transactionType,
    hash: entryHash(name, input.transactionType, value),
    quick: true,
    addedAt: at,
  }))
  return { ...state, savingAreaEntries: [...state.savingAreaEntries, ...added] }
}
