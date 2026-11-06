// Summary page: pick a period, see Income / Expense / Saving totals separately,
// per-section folder breakdowns and recent transactions in that period.
//
// Props:
//   state          AppState (canonical) - must be non-null
//   onBack         () => void   optional back button
//   initialPeriod  'today' | 'month' | 'year' | 'all' (default 'month')

import { useMemo, useState } from 'react'
import RecentList from './RecentList.jsx'
import {
  calculatePeriodTotals,
  calculateFolderBreakdown,
  getPeriodRange,
} from '../../domain/analytics.js'
import { formatINR } from '../../utils/format.js'
import './Summary.css'

const SECTIONS = [
  { id: 'income', title: 'Income' },
  { id: 'expense', title: 'Expense' },
  { id: 'saving', title: 'Saving' },
]

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function SummaryView({ state, onBack, initialPeriod = 'month' }) {
  const [period, setPeriod] = useState(initialPeriod)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rangeError =
    period === 'custom' && DATE_RE.test(from) && DATE_RE.test(to) && from > to
      ? 'The start date is after the end date.'
      : ''

  // Custom range is applied only when valid; until then show nothing filtered by a guess.
  const filters = useMemo(() => {
    if (period !== 'custom') return getPeriodRange(period)
    return {
      fromDate: DATE_RE.test(from) ? from : null,
      toDate: DATE_RE.test(to) ? to : null,
    }
  }, [period, from, to])

  const data = useMemo(() => {
    if (rangeError) return null
    const totals = calculatePeriodTotals(state, filters)
    const breakdown = {}
    for (const s of SECTIONS) breakdown[s.id] = calculateFolderBreakdown(state, s.id, filters)
    const inPeriod = (state.transactions || []).filter((tx) => {
      if (!filters.fromDate && !filters.toDate) return true
      const d = tx.transactionDate
      if (!d) return false
      return (!filters.fromDate || d >= filters.fromDate) && (!filters.toDate || d <= filters.toDate)
    })
    const recent = [...inPeriod]
      .sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0))
      .slice(0, 8)
    return { totals, breakdown, recent }
  }, [state, filters, rangeError])

  return (
    <main className="summary">
      <div className="sum-top">
        {onBack && (
          <button type="button" className="sum-back" onClick={onBack}>← Back</button>
        )}
        <h1 className="sum-title">Summary</h1>
      </div>

      <div className="sum-periods" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`sum-chip${period === p.id ? ' sum-chip--on' : ''}`}
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="sum-range">
          <label>
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          {rangeError && <p className="sum-error" role="alert">{rangeError}</p>}
        </div>
      )}

      {data && (
        <>
          <dl className="sum-trio">
            {SECTIONS.map((s) => (
              <div key={s.id} className={`sum-trio__item sum-trio__item--${s.id}`}>
                <dt>{s.title}</dt>
                <dd>{formatINR(data.totals[s.id])}</dd>
              </div>
            ))}
          </dl>
          <p className="sum-note">
            {data.totals.count} {data.totals.count === 1 ? 'transaction' : 'transactions'} in this period.
            Totals are never combined into one balance.
          </p>

          {SECTIONS.map((s) => (
            <section key={s.id} className="sum-card" aria-labelledby={`sum-${s.id}`}>
              <h2 id={`sum-${s.id}`} className="sum-card__title">{s.title} by folder</h2>
              {data.breakdown[s.id].length === 0 ? (
                <p className="sum-empty">No {s.title.toLowerCase()} in this period.</p>
              ) : (
                <ul className="sum-break">
                  {data.breakdown[s.id].map((g) => (
                    <li key={g.key} className="sum-break__row">
                      <span className="sum-break__name">{g.name}</span>
                      <span className="sum-break__count">
                        {g.count} {g.count === 1 ? 'record' : 'records'}
                      </span>
                      <span className={`sum-break__amount sum-text--${s.id}`}>{formatINR(g.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="sum-card" aria-labelledby="sum-recent">
            <h2 id="sum-recent" className="sum-card__title">Recent in this period</h2>
            <RecentList transactions={data.recent} />
          </section>
        </>
      )}
    </main>
  )
}

export default SummaryView
