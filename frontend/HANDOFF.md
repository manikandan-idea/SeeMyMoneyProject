# HANDOFF — Developer 4 (Dashboard, Summary & Financial Analytics)

## Files (paths relative to project root)
New:
- `frontend/src/domain/analytics.js`
- `frontend/src/domain/analytics.test.js`
- `frontend/src/components/summary/DashboardView.jsx`
- `frontend/src/components/summary/SummaryView.jsx`
- `frontend/src/components/summary/RecentList.jsx` (small shared list, extra file inside my folder)
- `frontend/src/components/summary/Summary.css`
Modified:
- `frontend/src/components/SectionTile.jsx` — wording only: "N entries" -> "N transactions" / "No transactions yet" (avoids confusion with Saving Area entries). Props unchanged.
- `frontend/HANDOFF.md` (this file; Developer 5 should rename/merge it as needed)

No dependency added. No other file touched.

## Exports — `src/domain/analytics.js`
Contract (shapes exactly as in the shared contract):
- `calculateSectionTotals(state, sectionId, filters) -> { sectionId, total, count }`
- `calculateFolderTotals(state, folderId) -> { income, expense, saving, count, recursive }`
  (`recursive` is an EXTRA field with the same four numbers; see folder rule)
- `calculatePeriodTotals(state, filters) -> { income, expense, saving, count }`
- `getRecentTransactions(state, limit = 5) -> Transaction[]` (newest first; original objects)

Extra (not in contract, safe to ignore): `calculateFolderBreakdown(state, sectionId, filters) -> [{ key, folderId, name, total, count }]`,
`getPeriodRange('today'|'month'|'year'|'all', now?) -> { fromDate, toDate }`, `toLocalDateKey(date)`, `SECTION_IDS`.

## Aggregation logic
- Reads ONLY `state.transactions`. Templates, usage counters, folders and `savingAreaEntries` are never money.
- Every row is counted once; no grouping happens here, so no double counting.
- Section totals bucket by `tx.sectionId`. Period and folder totals bucket by the `transactionType` snapshot (fallback: `sectionId`).
- Only positive finite numbers count as money; other amounts contribute 0. A row with an invalid amount adds 0 to totals but still adds 1 to `count`. Rounded to 2 decimals to hide float dust.
- Hidden folders and settled data are included: no use of `folder.hidden`.
- Income, Expense and Saving are never combined; Saving is never Income - Expense.

## Date rules
- Filters use `transactionDate` (local `YYYY-MM-DD`), inclusive, plain string comparison. Never UTC substrings.
- With an active date filter, rows whose `transactionDate` is null (unknown legacy date) are EXCLUDED, not guessed. With no filter they are counted. Developer 5/1 may want to report how many such rows migration produced.
- Today / This Month / This Year ranges are computed from the browser's local date. Custom range is two date inputs; an inverted range shows an error instead of results.

## Folder total rule (direct vs recursive)
- Section total (dashboard tiles, `calculateSectionTotals`) = RECURSIVE: all transactions of the section, root and every nested folder.
- Opened-folder total (`calculateFolderTotals`, top-level fields) = DIRECT: only transactions whose `folderId` is that folder; subfolders excluded (each shows its own). This mirrors the original `totalOf` vs `directTotalOf`.
- `recursive` extra field gives the descendant roll-up (via `parentFolderId`) so the unresolved rule can be flipped in the UI without changing this module.

## Component props
- `<DashboardView state onOpenSection(sectionId) onOpenSummary? onOpenHistory? recentLimit? />` — renders the full dashboard `<main>` (title, 3 tiles, this-month snapshot, recent list). Uses `SectionTile` and the existing `.dashboard*`/`.tile*` classes from `App.css`. Replaces the inline dashboard markup in `App.jsx`.
- `<SummaryView state onBack? initialPeriod? />` — period chips, 3 separate totals, per-section folder breakdown, recent-in-period list.
- `state` must be the non-null AppState from `useAppStore()`; render these only when `status` is not `loading`.
- Both import `./Summary.css`; no navigation owned here.

## Integration notes for Developer 5
- Wire `DashboardView` and `SummaryView` in `App.jsx`; add a nav entry for Summary and pass `onOpenHistory` to your History page.
- `SectionTile` tint classes (`tile--income` etc.) still come from `App.css`.
- `formatINR` from `utils/format.js` is reused (en-IN grouping).

## Open questions
1. Final nested-folder roll-up rule is unresolved (see above).
2. Whether rows with unknown `transactionDate` should appear in period views.
3. Section total uses `sectionId`, period totals use `transactionType`; they should always agree. If a migration ever produces a mismatch, the two screens would differ.

## Tests / commands actually run
- `node --test src/domain/analytics.test.js` -> 12 tests, 12 pass, 0 fail (Node v22).
- Server-render smoke test of `DashboardView` and `SummaryView` (compiled with tsx, global React shim, CSS stubbed): both rendered with sample transactions and with empty state; ₹1,25,000 Indian grouping confirmed. This is NOT a browser test.
- `npm run lint` and `npm run build`: **NOT VERIFIED.** The `node_modules` inside the supplied ZIP are Windows binaries (oxlint/rolldown fail to load on this Linux machine) and there is no network to reinstall. Developer 5 must run both.
- Not tested: interactive behaviour in a browser (chip clicks, date inputs), responsive layout visually.
