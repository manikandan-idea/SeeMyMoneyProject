// App root: the ONLY place that wires navigation and callbacks.
// All data lives in IndexedDB behind useAppStore(); every change goes through commit().
// Views: period pages (Today / This Month / This Year / Infrequent / Settled, opens on Today),
// an opened folder, record history, hidden folders.

import { useCallback, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import SectionView from './components/SectionView.jsx'
import HiddenView from './components/HiddenView.jsx'
import PeriodPage from './components/period/PeriodPage.jsx'
import HistoryView from './components/records/HistoryView.jsx'
import { useAppStore } from './data/useAppStore.jsx'
import {
  createFolder,
  updateFolder,
  setFolderHidden,
  duplicateFolderStructure,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  addSavingAreaEntry,
} from './domain/folderChecklist.js'
import {
  createTransaction,
  updateTransactionAmount,
  deleteTransaction,
  getChecklistUsageCount,
} from './domain/records.js'
import { calculateSectionTotals, calculateFolderTotals } from './domain/analytics.js'
import './App.css'

const SECTION_META = [
  { id: 'income', title: 'Income', icon: '💰' },
  { id: 'expense', title: 'Expense', icon: '💸' },
  { id: 'saving', title: 'Saving', icon: '🐖' },
]

function App() {
  const { state, status, error, commit, reload, dismissError } = useAppStore()
  const [view, setView] = useState({ name: 'period', tab: 'today' })

  const goHome = useCallback(
    () => setView((v) => ({ name: 'period', tab: v.returnTab || (v.name === 'period' ? v.tab : 'today') })),
    [],
  )

  // Fire-and-forget commit for section UI callbacks. A failed commit leaves the
  // saved state untouched and the store exposes `error`, which we show in a banner.
  const run = useCallback(
    (updater) => commit(updater).catch(() => {}),
    [commit],
  )

  const sectionActions = useMemo(() => {
    if (view.name !== 'section') return null
    const sectionId = view.sectionId
    const folderName = (s, folderId) =>
      folderId ? s.folders.find((f) => f.id === folderId)?.name : null
    return {
      createFolder: (input) => run((s) => createFolder(s, { ...input, sectionId })),
      updateFolder: (id, patch) => run((s) => updateFolder(s, id, patch)),
      setFolderHidden: (id, hidden) => run((s) => setFolderHidden(s, id, hidden)),
      duplicateFolder: (id) => run((s) => duplicateFolderStructure(s, id)),
      createChecklist: ({ folderId, title, defaultAmount, transactionType }) =>
        run((s) => createChecklistTemplate(s, { sectionId, folderId, title, defaultAmount, transactionType })),
      updateChecklist: (id, patch) => run((s) => updateChecklistTemplate(s, id, patch)),
      // Removes ONLY the reusable template. Transactions are never touched.
      deleteChecklist: (id) => run((s) => deleteChecklistTemplate(s, id)),
      addSavingAreaEntry: ({ ownerFolderId, sourceType, sourceId }) =>
        run((s) => addSavingAreaEntry(s, { sectionId, ownerFolderId, sourceType, sourceId })),
      recordChecklist: ({ folderId, checklistId, amount, source }) =>
        run((s) =>
          createTransaction(s, {
            sectionId,
            folderId: folderId ?? null,
            checklistId,
            amount,
            source: source || 'checklist',
          }),
        ),
      recordOther: ({ folderId, amount, description }) =>
        run((s) =>
          createTransaction(s, {
            sectionId,
            folderId: folderId ?? null,
            checklistId: null,
            description: description || 'Other',
            amount,
            transactionType: sectionId,
            source: 'other',
          }),
        ),
      recordFolderOneTime: ({ folderId, amount, description }) =>
        run((s) =>
          createTransaction(s, {
            sectionId,
            folderId: folderId ?? null,
            checklistId: null,
            description: description || folderName(s, folderId) || 'One-time',
            amount,
            transactionType: sectionId,
            source: 'folder-one-time',
          }),
        ),
      addEntry: ({ folderId, description, amount }) =>
        run((s) =>
          createTransaction(s, {
            sectionId,
            folderId: folderId ?? null,
            checklistId: null,
            description,
            amount,
            transactionType: sectionId,
            source: 'manual',
          }),
        ),
    }
  }, [view, run])

  // Callbacks for the Checklist section on period pages (checklists may sit
  // directly on the page, with no folder).
  const pageActions = {
    record: (checklistId, amount, source) =>
      run((s) => {
        const c = s.checklists.find((x) => x.id === checklistId)
        return createTransaction(s, {
          sectionId: c.sectionId, folderId: c.folderId ?? null, checklistId, amount, source,
        })
      }),
    updateChecklist: (id, patch) => run((s) => updateChecklistTemplate(s, id, patch)),
    deleteChecklist: (id) => run((s) => deleteChecklistTemplate(s, id)),
    createChecklist: (input) => run((s) => createChecklistTemplate(s, { ...input, folderId: null })),
  }

  const header = (
    <Header
      current={view.name}
      onDashboard={() => setView({ name: 'period', tab: 'today' })}
      onShowHistory={() => setView((v) => ({ name: 'history', returnTab: v.name === 'period' ? v.tab : v.returnTab }))}
      onShowHidden={() => setView((v) => ({ name: 'hidden', returnTab: v.name === 'period' ? v.tab : v.returnTab }))}
    />
  )

  if (status === 'loading' || (!state && status !== 'error')) {
    return (
      <div className="app">
        {header}
        <main className="dashboard" role="status">
          <p className="dashboard__subtitle">Loading your data…</p>
        </main>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="app">
        {header}
        <main className="dashboard" role="alert">
          <h1 className="dashboard__title">Could not open your data</h1>
          <p className="dashboard__subtitle">{error?.message || 'Storage is unavailable.'}</p>
          <button type="button" className="header__hidden-btn" onClick={() => reload()}>
            Try again
          </button>
        </main>
      </div>
    )
  }

  // Direct totals for an opened folder / folder card; recursive for the section root
  // (matches the original totalOf vs directTotalOf convention).
  const getTotals = (sectionId, folderId) => {
    if (!folderId) {
      const r = calculateSectionTotals(state, sectionId)
      return { total: r.total, count: r.count }
    }
    const t = calculateFolderTotals(state, folderId)
    return { total: t[sectionId], count: t.count, income: t.income, expense: t.expense, saving: t.saving }
  }

  let body
  if (view.name === 'section') {
    const meta = SECTION_META.find((s) => s.id === view.sectionId)
    body = (
      <SectionView
        key={`${view.sectionId}:${view.folderId}`}
        sectionId={view.sectionId}
        sectionTitle={meta.title}
        sectionIcon={meta.icon}
        state={state}
        initialFolderId={view.folderId}
        onBack={goHome}
        actions={sectionActions}
        getUsageCount={(id) => getChecklistUsageCount(state, id)}
        getFolderRecords={(folderId) =>
          state.transactions.filter(
            (t) => t.sectionId === view.sectionId && (t.folderId ?? null) === (folderId ?? null),
          )
        }
        getTotals={(folderId) => getTotals(view.sectionId, folderId)}
      />
    )
  } else if (view.name === 'history') {
    body = (
      <HistoryView
        state={state}
        onBack={goHome}
        onDeleteTransaction={(id) => commit((s) => deleteTransaction(s, id))}
        onUpdateTransactionAmount={(id, n) => commit((s) => updateTransactionAmount(s, id, n))}
      />
    )
  } else if (view.name === 'hidden') {
    body = (
      <HiddenView
        state={state}
        onBack={goHome}
        onRestore={(id) => run((s) => setFolderHidden(s, id, false))}
        getFolderTotals={(id) => {
          const folder = state.folders.find((f) => f.id === id)
          return folder ? getTotals(folder.sectionId, id) : { total: 0, count: 0 }
        }}
      />
    )
  } else {
    body = (
      <PeriodPage
        state={state}
        tab={view.tab || 'today'}
        onTab={(tab) => setView({ name: 'period', tab })}
        onOpenFolder={(folder) =>
          setView({ name: 'section', sectionId: folder.sectionId, folderId: folder.id, returnTab: view.tab })
        }
        onAddFolder={({ name, sectionId, usage, frequency }) =>
          run((s) => createFolder(s, { sectionId, parentFolderId: null, name, usage, frequency, othersEnabled: false }))
        }
        actions={pageActions}
      />
    )
  }

  return (
    <div className="app">
      {header}
      {error && (
        <div className="app__error" role="alert">
          <span>Could not save: {error.message}. Your previous data is unchanged.</span>
          <button type="button" onClick={dismissError}>Dismiss</button>
        </div>
      )}
      {body}
    </div>
  )
}

export default App
