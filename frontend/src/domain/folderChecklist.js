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

function buildChecklist(folder, input, at) {
  return {
    id: makeId(),
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
    id: makeId(),
    sectionId,
    parentFolderId,
    name: cleanText(input.name, 'Folder name'),
    usage,
    frequency,
    othersEnabled: Boolean(input.othersEnabled),
    hidden: false,
    periodKey: periodKeyFor(usage),
    createdAt: at,
    updatedAt: at,
  }
  const checklists = (input.checklist || []).map((row) => buildChecklist(folder, row, at))
  return {
    ...state,
    folders: [...state.folders, folder],
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
export function createChecklistTemplate(state, input) {
  const folder = requireFolder(state, input.folderId)
  if (input.sectionId !== undefined && input.sectionId !== folder.sectionId) {
    throw new Error('Checklist sectionId must match its folder\'s section.')
  }
  const checklist = buildChecklist(folder, input, nowIso())
  return { ...state, checklists: [...state.checklists, checklist] }
}

const CHECKLIST_PATCH_FIELDS = ['title', 'defaultAmount', 'transactionType', 'frequency']

// Changes the reusable template only — i.e. FUTURE recordings. Existing
// transactions and Saving Area entry snapshots are left exactly as they are.
export function updateChecklistTemplate(state, checklistId, patch) {
  const checklist = requireChecklist(state, checklistId)
  const folder = requireFolder(state, checklist.folderId)
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
  return { ...state, checklists: state.checklists.map((c) => (c.id === checklistId ? next : c)) }
}

// Removes ONLY the reusable template. `transactions` and `savingAreaEntries`
// are passed through untouched (same array references). Unknown id: no-op.
export function deleteChecklistTemplate(state, checklistId) {
  if (!state.checklists.some((c) => c.id === checklistId)) return state
  return { ...state, checklists: state.checklists.filter((c) => c.id !== checklistId) }
}

// ---------- Saving Area ----------

// input: { sectionId, ownerFolderId, sourceType, sourceId }
// Every call appends ONE new SavingAreaEntry (own id). The source checklist /
// folder is not changed. Repeated adds make separate rows (never a counter).
// Not a transaction — `transactions` is never touched.
export function addSavingAreaEntry(state, input) {
  const owner = requireFolder(state, input.ownerFolderId)
  if (input.sectionId !== undefined && input.sectionId !== owner.sectionId) {
    throw new Error('Saving Area entry sectionId must match the owner folder\'s section.')
  }
  if (!SAVING_SOURCE_TYPES.includes(input.sourceType)) {
    throw new Error(`Invalid Saving Area source type "${input.sourceType}".`)
  }
  let titleSnapshot
  if (input.sourceType === 'checklist') {
    const source = requireChecklist(state, input.sourceId)
    if (source.sectionId !== owner.sectionId) throw new Error('Source must be in the same section.')
    titleSnapshot = source.title
  } else {
    const source = requireFolder(state, input.sourceId)
    if (source.id === owner.id) throw new Error('A folder cannot be added to its own Saving Area.')
    if (source.sectionId !== owner.sectionId) throw new Error('Source must be in the same section.')
    titleSnapshot = source.name
  }
  const entry = {
    id: makeId(),
    sectionId: owner.sectionId,
    ownerFolderId: owner.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    titleSnapshot,
    addedAt: nowIso(),
  }
  return { ...state, savingAreaEntries: [...state.savingAreaEntries, entry] }
}

// Safe movement primitive: reassign every entry owned by sourceFolderId to
// targetFolderId (same entry ids, same order). Validates the target BEFORE any
// change. Repeating the call finds nothing left in the source and returns the
// same state, so there are never duplicates. Folders, checklists and
// transactions are untouched.
// Which folder is the "next period" target is a UI/workflow decision that is
// not defined yet — see HANDOFF.md.
export function settleSavingAreaEntries(state, { sourceFolderId, targetFolderId }) {
  const target = requireFolder(state, targetFolderId)
  if (sourceFolderId === targetFolderId) return state
  const source = state.folders.find((f) => f.id === sourceFolderId)
  if (source && source.sectionId !== target.sectionId) {
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

// ---------- read-only selectors ----------

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
    else top.push(node) // top-level (or orphan: parent missing — keep it reachable)
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

// Display-only grouping of Saving Area rows ("Tea ×3"). The underlying rows
// stay separate. Returns [{ key, sourceType, sourceId, titleSnapshot, count, entries }].
export function groupSavingAreaEntries(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = `${entry.sourceType}:${entry.sourceId}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        titleSnapshot: entry.titleSnapshot,
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
