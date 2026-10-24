// App root: owns the data tree and which view is open.
// Views: Dashboard, one SectionView at a time, or the Hidden folders page.
// Daily folders auto-submit on first open of a new day (in the state initializer).

import { useState } from 'react'
import Header from './components/Header.jsx'
import SectionTile from './components/SectionTile.jsx'
import SectionView from './components/SectionView.jsx'
import HiddenView from './components/HiddenView.jsx'
import {
  sampleData,
  getNode,
  findFolder,
  totalOf,
  countItems,
  makeId,
  currentPeriodKey,
  nowIso,
  autoSubmitFolders,
  duplicateFolderStructure,
} from './data/sampleData.js'
import './App.css'


const sections = [
  { id: 'income', title: 'Income', icon: '💰' },
  { id: 'expense', title: 'Expense', icon: '💸' },
  { id: 'saving', title: 'Saving', icon: '🐖' },
]

function App() {
  // Lazy initializer: auto-submit folders (daily/monthly/yearly) on the first
  // open of a new period, BEFORE the first render.
  // Unticked checklist rows are skipped (user's rule); ＋-ed entries are kept.
  const [data, setData] = useState(() => {
    const initial = structuredClone(sampleData)
    for (const section of sections) {
      autoSubmitFolders(initial[section.id])
    }
    return initial
  })
  const [openSection, setOpenSection] = useState(null) // null = dashboard
  const [showHidden, setShowHidden] = useState(false)

  // Run a mutation on one section's tree (cloned first — React-safe).
  function mutateSection(sectionId, mutator) {
    setData((prev) => {
      const next = structuredClone(prev)
      mutator(next[sectionId])
      return next
    })
  }

  // ---------- data actions (all take sectionId + folder path) ----------

  function addFolder(sectionId, path, payload) {
    mutateSection(sectionId, (root) => {
      const parent = getNode(root, path)
      parent.folders.push({
        id: makeId(),
        name: payload.name,
        usage: payload.usage,
        frequency: payload.frequency,
        othersEnabled: payload.othersEnabled,
        checklist: payload.checklist.map((row) => ({
          id: makeId(),
          title: row.title,
          amount: row.amount,
          timesRecorded: 0,
          lastRecorded: null,
        })),
        others: [],
        items: [],
        hidden: false,
        periodKey: currentPeriodKey(payload.usage),
        folders: [],
      })
    })
  }

  function addItem(sectionId, path, payload) {
    mutateSection(sectionId, (root) => {
      const node = getNode(root, path)
      node.items.push({ id: makeId(), ...payload, recordedAt: nowIso() })
    })
  }

  function addChecklistRow(sectionId, path, title, amount) {
    mutateSection(sectionId, (root) => {
      getNode(root, path).checklist.push({
        id: makeId(),
        title,
        amount,
        timesRecorded: 0,
        lastRecorded: null,
      })
    })
  }

  function updateChecklistRow(sectionId, path, rowId, amount) {
    mutateSection(sectionId, (root) => {
      const row = getNode(root, path).checklist.find((r) => r.id === rowId)
      if (row && Number.isFinite(amount) && amount > 0) row.amount = amount
    })
  }

  function deleteChecklistRow(sectionId, path, rowId) {
    mutateSection(sectionId, (root) => {
      const node = getNode(root, path)
      node.checklist = node.checklist.filter((row) => row.id !== rowId)
    })
  }

  function recordChecklistRow(sectionId, path, rowId, amount) {
    mutateSection(sectionId, (root) => {
      const node = getNode(root, path)
      const row = node.checklist.find((r) => r.id === rowId)
      if (!row) return
      const at = nowIso()
      node.items.push({ id: makeId(), description: row.title, amount, recordedAt: at })
      row.timesRecorded += 1
      row.lastRecorded = { amount, at }
    })
  }

  function addOther(sectionId, path, payload) {
    mutateSection(sectionId, (root) => {
      getNode(root, path).others.push({ id: makeId(), ...payload, recordedAt: nowIso() })
    })
  }

  function toggleHideFolder(sectionId, path, folderId) {
    mutateSection(sectionId, (root) => {
      const parent = getNode(root, path)
      const folder = parent.folders.find((f) => f.id === folderId)
      if (folder) folder.hidden = !folder.hidden
    })
  }

  function restoreFolder(folderId) {
    setData((prev) => {
      const next = structuredClone(prev)
      for (const section of sections) {
        const found = findFolder(next[section.id], folderId)
        if (found) {
          found.folder.hidden = false
          break
        }
      }
      return next
    })
  }

  // Manual submit (occasional folders only).
  // Records move to the section root; then delete (one-time) or hide (multi-use).
  function submitFolder(sectionId, folderId) {
    mutateSection(sectionId, (root) => {
      const found = findFolder(root, folderId)
      if (!found) return
      const { parent, folder } = found
      const from = folder.name
      for (const item of folder.items) root.items.push({ ...item, from })
      for (const other of folder.others) {
        root.items.push({
          id: other.id,
          description: other.details || 'Other',
          amount: other.amount,
          recordedAt: other.recordedAt,
          from,
        })
      }
      folder.items = []
      folder.others = []
      if (folder.frequency === 'once') {
        parent.folders = parent.folders.filter((f) => f.id !== folderId)
      } else {
        folder.hidden = true
        for (const row of folder.checklist) {
          row.timesRecorded = 0
          row.lastRecorded = null
        }
      }
    })
  }

  // "Add again": duplicate a folder's STRUCTURE (no recorded money) as a
  // sibling folder next to the original.
  function duplicateFolder(sectionId, folderId) {
    mutateSection(sectionId, (root) => {
      const found = findFolder(root, folderId)
      if (!found) return
      found.parent.folders.push(duplicateFolderStructure(found.folder))
    })
  }

  // ---------- views ----------

  if (showHidden) {
    return (
      <div className="app">
        <Header onShowHidden={() => setShowHidden(true)} />
        <HiddenView
          data={data}
          onBack={() => setShowHidden(false)}
          onRestore={restoreFolder}
        />
      </div>
    )
  }

  if (openSection) {
    const meta = sections.find((section) => section.id === openSection)
    const actions = {
      addFolder: (path, payload) => addFolder(openSection, path, payload),
      addItem: (path, payload) => addItem(openSection, path, payload),
      addChecklistRow: (path, title, amount) => addChecklistRow(openSection, path, title, amount),
      updateChecklistRow: (path, rowId, amount) => updateChecklistRow(openSection, path, rowId, amount),
      deleteChecklistRow: (path, rowId) => deleteChecklistRow(openSection, path, rowId),
      recordChecklistRow: (path, rowId, amount) => recordChecklistRow(openSection, path, rowId, amount),
      addOther: (path, payload) => addOther(openSection, path, payload),
      toggleHideFolder: (path, folderId) => toggleHideFolder(openSection, path, folderId),
      submitFolder: (folderId) => submitFolder(openSection, folderId),
      duplicateFolder: (folderId) => duplicateFolder(openSection, folderId),
    }
    return (
      <div className="app">
        <Header onShowHidden={() => setShowHidden(true)} />
        <SectionView
          key={openSection}
          sectionId={openSection}
          sectionTitle={meta.title}
          sectionIcon={meta.icon}
          root={data[openSection]}
          onBack={() => setOpenSection(null)}
          actions={actions}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <Header onShowHidden={() => setShowHidden(true)} />

      <main className="dashboard">
        <h1 className="dashboard__title">Welcome to See My Money</h1>
        <p className="dashboard__subtitle">
          Choose a section below to manage your money
        </p>

        <div className="dashboard__tiles">
          {sections.map((section) => (
            <SectionTile
              key={section.id}
              id={section.id}
              title={section.title}
              icon={section.icon}
              total={totalOf(data[section.id])}
              count={countItems(data[section.id])}
              onOpen={() => setOpenSection(section.id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

export default App
