// Dashboard: three SEPARATE section tiles (Income / Expense / Saving), a
// this-month snapshot and recent transactions. Read-only; navigation is wired by App.jsx.
//
// Props:
//   state            AppState (canonical) - must be non-null
//   onOpenSection    (sectionId) => void   open Income / Expense / Saving
//   onOpenSummary    () => void            optional; shows "Full summary" button
//   onOpenHistory    () => void            optional; shows "All records" button
//   recentLimit      number (default 5)

import { useMemo } from 'react'
import SectionTile from '../SectionTile.jsx'
import RecentList from './RecentList.jsx'
import {
  calculateSectionTotals,
  calculatePeriodTotals,
  getRecentTransactions,
  getPeriodRange,
} from '../../domain/analytics.js'
import { formatINR } from '../../utils/format.js'
import './Summary.css'

const SECTIONS = [
  { id: 'income', title: 'Income', icon: '💰' },
  { id: 'expense', title: 'Expense', icon: '💸' },
  { id: 'saving', title: 'Saving', icon: '🐖' },
]

function DashboardView({ state, onOpenSection, onOpenSummary, onOpenHistory, recentLimit = 5 }) {
  const view = useMemo(() => {
    const month = getPeriodRange('month')
    return {
      tiles: SECTIONS.map((s) => ({ ...s, ...calculateSectionTotals(state, s.id) })),
      month: calculatePeriodTotals(state, month),
      recent: getRecentTransactions(state, recentLimit),
    }
  }, [state, recentLimit])

  return (
    <main className="dashboard">
      <h1 className="dashboard__title">Welcome to See My Money</h1>
      <p className="dashboard__subtitle">Choose a section below to manage your money</p>

      <div className="dashboard__tiles">
        {view.tiles.map((t) => (
          <SectionTile
            key={t.id}
            id={t.id}
            title={t.title}
            icon={t.icon}
            total={t.total}
            count={t.count}
            onOpen={() => onOpenSection?.(t.id)}
          />
        ))}
      </div>

      <section className="sum-card" aria-labelledby="dash-month">
        <h2 id="dash-month" className="sum-card__title">This month</h2>
        <dl className="sum-trio">
          {SECTIONS.map((s) => (
            <div key={s.id} className={`sum-trio__item sum-trio__item--${s.id}`}>
              <dt>{s.title}</dt>
              <dd>{formatINR(view.month[s.id])}</dd>
            </div>
          ))}
        </dl>
        <p className="sum-note">
          {view.month.count} {view.month.count === 1 ? 'transaction' : 'transactions'} this month.
          Income, Expense and Saving are tracked separately.
        </p>
      </section>

      <section className="sum-card" aria-labelledby="dash-recent">
        <div className="sum-card__head">
          <h2 id="dash-recent" className="sum-card__title">Recent transactions</h2>
          <span className="sum-card__links">
            {onOpenHistory && (
              <button type="button" className="sum-link" onClick={onOpenHistory}>All records</button>
            )}
            {onOpenSummary && (
              <button type="button" className="sum-link" onClick={onOpenSummary}>Full summary</button>
            )}
          </span>
        </div>
        <RecentList transactions={view.recent} />
      </section>
    </main>
  )
}

export default DashboardView
