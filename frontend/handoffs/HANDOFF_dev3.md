# HANDOFF — Developer 3 (Transactions & Record History)

## Files (all under `frontend/`)
- `src/domain/records.js` (new)
- `src/components/records/HistoryView.jsx`, `RecordRow.jsx`, `RecordGroup.jsx`, `History.css` (new)
- `tests/records.test.js` (new)
- `HANDOFF.md`

No restricted file (App.jsx, src/data/*, package.json, CSS globals) was touched. No new dependencies.

## Domain exports (`src/domain/records.js`)
```js
createTransaction(state, { sectionId, folderId, checklistId, description, amount, transactionType, source, now? }): AppState
updateTransactionAmount(state, transactionId, newAmount): AppState
deleteTransaction(state, transactionId): AppState
selectHistoryRecords(state, { sectionId, transactionType, fromDate, toDate, search }): Transaction[]
groupTransactionsByChecklistAndAmount(records): Group[]
getChecklistUsageCount(state, checklistId): number
// extras
localDateKey(date = new Date()): 'YYYY-MM-DD'   // local calendar date
newTransactionId(): string                      // crypto.randomUUID with fallback
```
`now` (Date) is optional and only for deterministic tests.

### createTransaction behaviour
- `amount` must be a positive finite number, else it throws (so `commit` rejects and nothing is saved).
- With `checklistId`: template must exist (throws otherwise). Snapshots `checklistTitleSnapshot`; `sectionId`, `folderId`, `transactionType` default from the template; `description` defaults to the template title; `source` defaults to `checklist`. Use `source: 'checklist-other'` for the one-time override; the template default is never changed.
- `folderNameSnapshot` comes from the folder found by `folderId` (null for section-root).
- Without `checklistId`: `description` is required, `checklistId` is null, `transactionType` defaults to `sectionId`, `source` defaults to `manual` (use `other` / `folder-one-time` as appropriate).
- `source` `checklist`/`checklist-other` requires a checklistId.
- `recordedAt` = ISO; `transactionDate` = LOCAL date (tested under UTC-edge cases and TZ=Asia/Kolkata, Pacific/Auckland).
- Pure: input state is not mutated.

### Other behaviour
- `updateTransactionAmount`: changes only that row's `amount` and `updatedAt`. Unknown id → same state returned. Invalid amount throws.
- `deleteTransaction`: filters exactly one id; `checklists`, `folders`, `savingAreaEntries` keep the same references. Unknown id → same state returned.
- `selectHistoryRecords`: newest first (`recordedAt` desc, later insertion wins ties). `search` matches description + checklist title snapshot, case-insensitive. Dates compare `transactionDate` (rows lacking one are excluded when a date bound is set).
- `getChecklistUsageCount`: count of surviving transactions with that `checklistId`, any amount. Saving Area entries are never counted.

## Grouping keys (display-only)
- Linked: `c:<checklistId>|<amount>`
- Unlinked: `m:<transactionType>|<description trimmed, lowercased>|<amount>`
Group shape: `{ key, checklistId, title, transactionType, amount, count, total, latestRecordedAt, records }`. Input rows are not altered.

## UI — props for Developer 5
```jsx
<HistoryView
  state={state}                                   // canonical AppState (uses state.transactions)
  onDeleteTransaction={(id) => commit(s => deleteTransaction(s, id))}
  onUpdateTransactionAmount={(id, n) => commit(s => updateTransactionAmount(s, id, n))} // optional; omit to hide Edit
  onBack={() => ...}                              // optional
/>
```
Callbacks may return a Promise; the dialog stays open and shows the error if it rejects. Import path: `src/components/records/HistoryView.jsx` (imports its own `History.css`; relies on `--text/--heading/--muted/--card/--border/--green/--red/--blue/--shadow-*/--radius` from index.css).

Features: newest first, INR amount, date/time, type badge, folder › checklist snapshot, search, type + from/to date filters, clear filters, empty states, "Group same amount" toggle (groups expand to individual rows), per-record Delete with confirmation dialog (Esc closes, focus restored), per-record Edit amount. There is NO group-level delete.

## Deletion guarantees / deleted templates
Rows display from their own snapshots (`description`, `checklistTitleSnapshot`, `folderNameSnapshot`, type, amount, date), never from live templates, so deleting a checklist/folder template leaves History intact (covered by a test). Nothing in this module cascades.

## Assumptions / open items
1. Usage-count display on the checklist UI is Developer 2's; call `getChecklistUsageCount(state, id)`.
2. Legacy migrated rows may lack snapshots (null); the UI falls back to `description`.
3. `selectHistoryRecords` also matches `checklistTitleSnapshot` in search (a superset of "description").
4. A group of exactly one record is shown as a plain row in grouped mode.
5. `package.json` has no `test` script (not my file). Suggested: `"test": "node --test tests/"` fails on Node 22 for a bare directory; use `"node --test tests/*.test.js"` (shell glob) or list files.

## Commands actually run
- `node --test tests/records.test.js` → 11 pass, 0 fail (also with `TZ=Asia/Kolkata` and `TZ=Pacific/Auckland`).
- `npx oxlint` on the full project copy (with my files added) → no errors/warnings in my files.
- `npm ci` + `npx vite build` on a copy with my files added → succeeded. NOTE: my files are not imported by the original App.jsx, so that build did not bundle them; I separately built `HistoryView.jsx` with `vite build --ssr` and server-rendered it with sample data (rendered OK). Browser interaction (dialogs, filters) was NOT verified in a real browser.
