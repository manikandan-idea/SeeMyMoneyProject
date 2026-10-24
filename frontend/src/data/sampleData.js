// TEMPORARY in-browser sample data (a "fake backend").
// The real Spring Boot API will replace the mutation logic later;
// the UI components keep the same shapes.

let idCounter = 1000

export function makeId() {
  idCounter += 1
  return `id-${idCounter}`
}

// "2026-08-29" in LOCAL time (toISOString would be UTC — wrong for India).
export function todayKey() {
  return currentPeriodKey('daily')
}

// Period key matching a folder's usage:
//   daily   -> "2026-08-29"
//   monthly -> "2026-08"
//   yearly  -> "2026"
export function currentPeriodKey(usage) {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  if (usage === 'monthly') return `${year}-${month}`
  if (usage === 'yearly') return String(year)
  return `${year}-${month}-${String(d.getDate()).padStart(2, '0')}`
}

export function nowIso() {
  return new Date().toISOString()
}

// A folder node:
// { id, name, usage: 'daily'|'occasional'|null, frequency: 'once'|'multiple'|null,
//   othersEnabled, checklist: [{id,title,amount,timesRecorded,lastRecorded}],
//   others: [{id,amount,details,recordedAt}], items: [{id,description,amount,recordedAt,from?}],
//   hidden, dayKey, folders: [...] }
// Section roots are plain nodes: { folders, items } only.

const incomeRoot = {
  folders: [
    {
      id: 'f-business',
      name: 'Business',
      usage: 'occasional',
      frequency: 'multiple',
      othersEnabled: false,
      checklist: [
        { id: 'cl-client', title: 'Client A payment', amount: 10000, timesRecorded: 0, lastRecorded: null },
      ],
      others: [],
      items: [],
      hidden: false,
      periodKey: currentPeriodKey('occasional'),
      folders: [
        {
          id: 'f-projects',
          name: 'Projects',
          usage: 'occasional',
          frequency: 'multiple',
          othersEnabled: false,
          checklist: [],
          others: [],
          items: [
            { id: 'i-logo', description: 'Logo design', amount: 5000, recordedAt: '2026-08-18T14:20:00' },
          ],
          hidden: false,
          periodKey: currentPeriodKey('occasional'),
          folders: [],
        },
      ],
    },
    {
      id: 'f-investments',
      name: 'Investments',
      usage: 'occasional',
      frequency: 'multiple',
      othersEnabled: false,
      checklist: [
        { id: 'cl-dividends', title: 'Dividends', amount: 1200, timesRecorded: 0, lastRecorded: null },
      ],
      others: [],
      items: [],
      hidden: false,
      periodKey: currentPeriodKey('occasional'),
      folders: [],
    },
  ],
  items: [
    { id: 'i-salary', description: 'Monthly salary', amount: 50000, recordedAt: '2026-08-01T09:00:00' },
  ],
}

const expenseRoot = {
  folders: [
    {
      // dayKey is YESTERDAY on purpose: opening the app triggers the
      // daily auto-submit once (records move to Expense root, folder resets).
      id: 'f-daily',
      name: 'Daily Tea & Auto',
      usage: 'daily',
      frequency: null,
      othersEnabled: true,
      checklist: [
        { id: 'cl-bus', title: 'Bus / auto fare', amount: 40, timesRecorded: 1, lastRecorded: { amount: 40, at: '2026-08-28T09:10:00' } },
        { id: 'cl-tea', title: 'Tea & snacks', amount: 20, timesRecorded: 1, lastRecorded: { amount: 20, at: '2026-08-28T16:45:00' } },
        { id: 'cl-lunch', title: 'Lunch', amount: 120, timesRecorded: 0, lastRecorded: null },
      ],
      others: [
        { id: 'o-news', amount: 30, details: 'Newspaper', recordedAt: '2026-08-28T08:05:00' },
      ],
      items: [
        { id: 'i-bus', description: 'Bus / auto fare', amount: 40, recordedAt: '2026-08-28T09:10:00' },
        { id: 'i-tea', description: 'Tea & snacks', amount: 20, recordedAt: '2026-08-28T16:45:00' },
      ],
      hidden: false,
      periodKey: '2026-08-28',
      folders: [],
    },
    {
      id: 'f-home',
      name: 'Home',
      usage: 'monthly',
      frequency: null,
      othersEnabled: true,
      checklist: [
        { id: 'cl-rent', title: 'Rent', amount: 15000, timesRecorded: 0, lastRecorded: null },
        { id: 'cl-elect', title: 'Electricity bill', amount: 800, timesRecorded: 0, lastRecorded: null },
      ],
      others: [
        { id: 'o-snacks', amount: 350, details: 'Tea snacks for guests', recordedAt: '2026-08-21T17:30:00' },
      ],
      items: [],
      hidden: false,
      periodKey: '2026-07',
      folders: [],
    },
    {
      id: 'f-travel',
      name: 'Travel',
      usage: 'occasional',
      frequency: 'once',
      othersEnabled: false,
      checklist: [],
      others: [],
      items: [
        { id: 'i-train', description: 'Train ticket', amount: 1500, recordedAt: '2026-08-22T08:15:00' },
      ],
      hidden: false,
      periodKey: currentPeriodKey('occasional'),
      folders: [],
    },
  ],
  items: [
    { id: 'i-groceries', description: 'Groceries', amount: 2000, recordedAt: '2026-08-20T18:40:00' },
  ],
}

const savingRoot = {
  folders: [
    {
      id: 'f-goal',
      name: 'Goal 2026',
      usage: 'yearly',
      frequency: null,
      othersEnabled: true,
      checklist: [
        { id: 'cl-vacation', title: 'Vacation fund', amount: 2500, timesRecorded: 0, lastRecorded: null },
      ],
      others: [],
      items: [],
      hidden: false,
      periodKey: '2025',
      folders: [],
    },
  ],
  items: [
    { id: 'i-emergency', description: 'Emergency fund deposit', amount: 5000, recordedAt: '2026-08-03T11:00:00' },
  ],
}

export const sampleData = {
  income: incomeRoot,
  expense: expenseRoot,
  saving: savingRoot,
}

// ---------- tree helpers ----------

// Walk down the tree following a path of folder ids.
export function getNode(root, path) {
  let node = root
  for (const folderId of path) {
    const next = node.folders.find((folder) => folder.id === folderId)
    if (!next) break
    node = next
  }
  return node
}

// Depth-first search for one folder anywhere under root.
export function findFolder(root, folderId, path = []) {
  for (const folder of root.folders) {
    const here = [...path, folder.id]
    if (folder.id === folderId) return { parent: root, folder, path: here }
    const found = findFolder(folder, folderId, here)
    if (found) return found
  }
  return null
}

// Every hidden folder under root, with its path and crumb names.
export function collectHidden(root, path = [], names = [], out = []) {
  for (const folder of root.folders) {
    const here = [...path, folder.id]
    const hereNames = [...names, folder.name]
    if (folder.hidden) out.push({ folder, path: here, names: hereNames })
    collectHidden(folder, here, hereNames, out)
  }
  return out
}

// Recursive sum of all money under a node (entries + others + subfolders).
export function totalOf(node) {
  const items = node.items.reduce((sum, item) => sum + item.amount, 0)
  const others = (node.others || []).reduce((sum, other) => sum + other.amount, 0)
  return items + others + node.folders.reduce((sum, folder) => sum + totalOf(folder), 0)
}

// Recursive count of all entries under a node.
export function countItems(node) {
  return (
    node.items.length +
    (node.others || []).length +
    node.folders.reduce((sum, folder) => sum + countItems(folder), 0)
  )
}

// Sum of money DIRECTLY inside a node — its own entries + "Other" only,
// NOT counting anything inside subfolders (each subfolder shows its own total).
export function directTotalOf(node) {
  const items = node.items.reduce((sum, item) => sum + item.amount, 0)
  const others = (node.others || []).reduce((sum, other) => sum + other.amount, 0)
  return items + others
}

// Count of entries DIRECTLY inside a node (no subfolder recursion).
export function directCountOf(node) {
  return node.items.length + (node.others || []).length
}

// Deep copy of a folder's STRUCTURE only: same name, usage, checklist rows
// (progress reset), subfolders — but NO recorded entries, others, or history.
export function duplicateFolderStructure(folder) {
  return {
    id: makeId(),
    name: folder.name,
    usage: folder.usage,
    frequency: folder.frequency,
    othersEnabled: folder.othersEnabled,
    checklist: (folder.checklist || []).map((row) => ({
      id: makeId(),
      title: row.title,
      amount: row.amount,
      timesRecorded: 0,
      lastRecorded: null,
    })),
    others: [],
    items: [],
    hidden: false,
    periodKey: currentPeriodKey(folder.usage),
    folders: (folder.folders || []).map(duplicateFolderStructure),
  }
}

// ---------- submit / reset helpers ----------

// Move a folder's recorded entries to the section root (permanent history).
// Each moved entry is tagged `from` so the UI can show where it came from.
export function commitFolderRecords(root, folder) {
  const from = folder.name
  for (const item of folder.items) {
    root.items.push({ ...item, from })
  }
  for (const other of folder.others) {
    root.items.push({
      id: other.id,
      description: other.details || 'Other',
      amount: other.amount,
      recordedAt: other.recordedAt,
      from,
    })
  }
  const movedCount = folder.items.length + folder.others.length
  folder.items = []
  folder.others = []
  return movedCount
}

// Give a folder a fresh period: clear working records, reset checklist progress.
export function resetFolderFresh(folder, periodKey) {
  folder.items = []
  folder.others = []
  folder.hidden = false
  folder.periodKey = periodKey
  for (const row of folder.checklist) {
    row.timesRecorded = 0
    row.lastRecorded = null
  }
}

// Auto-submit folders on the first open of a new period:
//   daily -> every new day, monthly -> every new month, yearly -> every new year.
// Unticked rows are SKIPPED (your rule): only ＋-ed entries are kept.
export function autoSubmitFolders(root) {
  let changed = false
  function walk(node) {
    for (const folder of node.folders) {
      const expected = currentPeriodKey(folder.usage)
      if (
        (folder.usage === 'daily' || folder.usage === 'monthly' || folder.usage === 'yearly') &&
        folder.periodKey !== expected
      ) {
        commitFolderRecords(root, folder)
        resetFolderFresh(folder, expected)
        changed = true
      }
      walk(folder)
    }
  }
  walk(root)
  return changed
}
