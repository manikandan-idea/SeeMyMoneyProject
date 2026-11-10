# HANDOFF — Developer 1: Data Model, IndexedDB & Persistence

## Files (all new; no existing file was modified)

```
frontend/src/data/schema.js
frontend/src/data/storage.js
frontend/src/data/migrations.js
frontend/src/data/useAppStore.jsx
frontend/src/data/README.md
frontend/src/data/__tests__/fakeIndexedDB.js      (test helper)
frontend/src/data/__tests__/schema.test.js
frontend/src/data/__tests__/migrations.test.js
frontend/src/data/__tests__/storage.test.js
frontend/src/data/__tests__/controller.test.js
```

`App.jsx`, UI components, CSS, `package.json`, PWA files and `sampleData.js` are untouched.

## 1. IndexedDB layout

- Database: **`see-my-money`**, IndexedDB version **1**. `AppState.schemaVersion` = **1** (also stored in `meta` key `schema`).
- Stores (all keyPath as stated):
  - `folders` (`id`): indexes `sectionId`, `parentFolderId`, `hidden`, `periodKey`
  - `checklists` (`id`): `sectionId`, `folderId`
  - `transactions` (`id`): `sectionId`, `folderId`, `checklistId`, `recordedAt`, `transactionDate`
  - `savingAreaEntries` (`id`): `sectionId`, `ownerFolderId`, `sourceId`, `settlementStatus`
  - `meta` (`key`): `schema` = `{key, schemaVersion, updatedAt}`; `bootstrap` = `{key, completedAt, source, schemaVersion, report?}`
- Deviations you should know about (IndexedDB limitations, not choices):
  - IndexedDB cannot index booleans. The `hidden` index therefore uses an internal numeric field `__hidden` (0/1); the index name is still `hidden`.
  - `null` is not an indexable key, so `parentFolderId`, `folderId`, `checklistId`, `periodKey` indexes contain only non-null rows (top-level folders and root transactions are absent from them).
  - `settlementStatus` was requested but is **not a field of the shared SavingAreaEntry shape**. The index exists and is empty. Do not rely on it.
- Every row also carries an internal `__order` (array position) so lists come back in the order the app saved them. All `__*` fields are stripped on load and never appear in `AppState`.

## 2. Exports

`schema.js`
- Constants: `SCHEMA_VERSION`, `DB_NAME`, `DB_VERSION`, `STORE`, `ENTITY_STORES`, `META_KEYS`, `STORE_DEFINITIONS`, `SECTIONS`, `SECTION_IDS`, `TRANSACTION_TYPES`, `FOLDER_USAGES`, `FOLDER_FREQUENCIES`, `TRANSACTION_SOURCES`, `SAVING_SOURCE_TYPES`, `INTERNAL_PREFIX`
- `createId(): string` — `crypto.randomUUID()`, falls back to `getRandomValues`, then to a time+random+counter id (works on plain http)
- `nowIso(date = new Date()): string`
- `localDateKey(date = new Date()): 'YYYY-MM-DD'` — LOCAL date, not UTC
- `isoToLocalDateKey(iso): string | null`
- `currentPeriodKey(usage, date = new Date()): string` — monthly `YYYY-MM`, yearly `YYYY`, otherwise the local day
- `isValidDateKey(value): boolean`
- `createEmptyState(): AppState`
- `validateAppState(state): string[]` / `assertValidAppState(state): state` (throws `AppStateValidationError` with `.code === 'INVALID_STATE'`, `.problems`)
- `stableStringify`, `toStoredRow`, `fromStoredRow` (internal helpers)

`storage.js`
- `loadAppState(): Promise<AppState>`
- `saveAppState(nextState: AppState): Promise<void>` (resolves only after the IndexedDB transaction committed)
- `createStorage({ indexedDB?, getLegacyData?, now?, broadcast? }): { loadAppState, saveAppState, onExternalChange(cb) => unsubscribe, close() }` — same API on an injectable DB (used by the tests)
- `getDefaultStorage()`
- `createAppStoreController({ load, save, subscribeExternal?, validate? }): { getSnapshot, subscribe, start, commit, reload, dismissError }` — framework-free store behind the hook (lives in `storage.js` because I may only create the listed files, and it must be testable without React)
- `StorageError` (`.code`: `IDB_UNAVAILABLE`, `OPEN_FAILED`, `UPGRADE_FAILED`, `QUOTA_EXCEEDED`, `NEWER_SCHEMA`, `NOT_READY`, `STORAGE_FAILED`)

`migrations.js`
- `migrateLegacyData(legacy, { now? }): { state, report }` (pure)
- `normalizeLegacyTimestamp(value)`, `upgradeStoredState(state, fromVersion)`

`useAppStore.jsx`
- `useAppStore(): { state, status, error, commit, reload, dismissError }` — `dismissError` is an extra (not in the contract) so the UI can hide an error banner.

## 3. How `commit(updater)` works

- One shared store per page; every `useAppStore()` caller sees the same state.
- Loads, reloads and commits run through one promise queue. Each `updater(current)` receives the state that the previous commit already persisted, so two quick taps cannot lose an update. Updaters must be pure (never mutate `current`); sync or async both work.
- Flow: run updater → validate result → `status: 'saving'` (visible `state` still the OLD saved state) → one atomic readwrite transaction across all four entity stores (`durability: 'strict'`) → only after `complete` is `state` replaced and `status: 'ready'`.
- Updater returns the same object → treated as "no change", nothing is written.
- Failure (updater throws, validation fails, quota, aborted transaction): nothing is written, `state` stays the last saved state, `status: 'error'`, `error` is set, **`commit` rejects**. Later commits still run. The next successful commit clears the error. Handlers that don't care should `.catch(() => {})`.
- `commit` before a successful load rejects with `NOT_READY`; `reload()` retries the load.
- Cross-tab: a save only writes rows THIS tab changed/deleted (diffed against what it last loaded/saved), so a stale second tab cannot wipe rows saved by another tab. Other tabs are notified via `BroadcastChannel` and reload automatically (queued behind any pending commit).

## 4. Legacy migration and first-run protection

- On load: if `meta.bootstrap` exists → nothing is imported, ever. If it does not: in ONE readwrite transaction (marker re-checked inside it, so two tabs cannot both import) — if all four entity stores are empty, `migrateLegacyData(sampleData)` is validated and written plus a `bootstrap` marker (`source: 'legacy-sample-data'`, including the migration report); if any store already has data, only the marker (`source: 'existing-data'`) is written and nothing is imported. A save before any load also writes the marker. Emptying the database later does not re-import. An aborted transaction writes nothing, so the next launch retries.
- Migration is pure (does not mutate its input), deterministic, and never settles or auto-submits period folders: stale `periodKey`s (`f-daily` = `2026-08-28`, `f-home` = `2026-07`, `f-goal` = `2025`) are kept as they were.
- Mapping: folders flattened depth-first with original IDs, `parentFolderId`, `sectionId`; each legacy checklist → one `ChecklistTemplate` (`defaultAmount` = legacy `amount`, `frequency` = folder usage if daily/monthly/yearly else null); each legacy `items[]` and `others[]` row → its own `Transaction` (others' `details` → `description`, `source: 'other'`; items → `source: 'manual'`). Sample result: 7 folders, 8 checklists, 9 transactions (7 items + 2 others), 0 Saving Area entries.
- IDs preserved. Only an identical repeated id (same section/description/amount/time) is dropped; same id with different content is kept under `<id>~dupN` and reported. None occur in the sample data.
- Timestamps: legacy `YYYY-MM-DDTHH:mm:ss` (no zone) was parsed as local time by the old app, so it is converted to the same instant as a full ISO string; `transactionDate` is the date exactly as stored. Date-only values (none in the sample) get local midnight and are listed in the report.

## 5. Data not migrated / judgement calls to review

- **`timesRecorded` / `lastRecorded` counters** were not turned into transactions (contract). Reported in `meta.bootstrap.report.checklistCounterMismatches`: `cl-bus` and `cl-tea` (each `timesRecorded: 1`) have a same-title legacy row (`i-bus`, `i-tea`) but legacy rows never stored which checklist produced them, so they are **not linked** (`checklistId: null`, source `manual`) and their Usage Count will be 0. Linking by title would be a guess, so I did not.
- **`transactionType`** of legacy rows is set to the section id (the legacy section fixed the type: Income→income etc.). This is derived, not invented, but flag it if you disagree.
- **Folder/checklist `createdAt`/`updatedAt`**: legacy data has none; the import time is used (the Folder shape requires a timestamp).
- Legacy items auto-submitted to a section root carry `from` (folder name): stored as `folderNameSnapshot`, `folderId: null` (matching the name to an id would be a guess). None in the sample data.
- Rows that cannot be migrated safely (non-positive/non-number amount, missing/invalid `recordedAt`) are skipped but kept verbatim in the report (`skipped[].original`). None in the sample data.

## 6. Tests and commands actually executed

- `node --test "src/data/__tests__/*.test.js"` → **50 pass, 0 fail** (Node v22.23.4). Same result with `TZ=Asia/Kolkata`, `America/Los_Angeles`, `Pacific/Auckland`.
- Sanity mutations (then reverted; `storage.js` re-diffed identical to the original): diffing against the DB instead of the baseline → cross-tab test failed; publishing state before the save finished → 3 controller tests failed. So these tests do detect those bugs.
- Hook smoke: a copy of `useAppStore.jsx` (it has no JSX syntax) imported in Node with the real React and rendered with `react-dom/server` → renders `loading`, `state === null`, `commit`/`reload`/`dismissError` are functions.
- **Not run (could not):** `npm run lint` and `npm run build` — the supplied `node_modules` only contains Windows (`win32-x64`) native bindings for oxlint and Vite/Rolldown, which fail to load on this Linux sandbox. **Please run both.** Also not tested: a real browser's IndexedDB (tests use an in-memory fake that I wrote, so it models but is not the real implementation), and the hook with effects in a DOM (no jsdom available).
- No test failures occurred other than the intentional mutation checks above.

## 7. Integration instructions for Developer 5

1. Add to `package.json` (I may not edit it): `"test": "node --test \"src/data/__tests__/*.test.js\""` (and add other developers' test paths).
2. Replace `useState(sampleData)` in `App.jsx` with `useAppStore()`. Show a loading screen while `status === 'loading'` / `state === null`, and an error banner when `error` is set (offer `reload` if `state` is null, `dismissError` otherwise).
3. Remove the old `autoSubmitFolders(...)` call from `App.jsx`: it mutates the legacy tree and would conflict with the migrated data. Do not run any date-based settlement on startup unless Developer 2/the product owner defines it.
4. Keep `src/data/sampleData.js` in the project: `storage.js` imports it for the first-run import. Its helper functions are no longer needed by the app once the UI is migrated.
5. Saves are validated strictly. Output of Developers 2/3 must satisfy `validateAppState`, otherwise the commit is rejected with a readable message. The main requirements: transaction `folderId`, `folderNameSnapshot`, `checklistId`, `checklistTitleSnapshot` must be a string or `null` (not `undefined`); amounts finite and `> 0`; `transactionDate` a valid local `YYYY-MM-DD`; `source` one of the contract values; folder `usage`/`frequency` from the contract lists; every folder `parentFolderId` must exist, be in the same section and not form a loop. Checklist `frequency` is only checked to be a string or null. Transaction `folderId`/`checklistId` are deliberately NOT required to exist.
6. Legacy `submitFolder` deleted "once" occasional folders. The contract forbids permanent folder deletion with history, so persistence never deletes folders on its own; deleting a folder is only possible if a domain function removes it from `state.folders` (it should not remove transactions).
7. Service worker: never clear IndexedDB on cache updates (nothing here depends on the SW). Optional: calling `navigator.storage.persist()` reduces eviction risk, but Firefox may show a prompt, so I did not add it.

## 8. Open questions

- Should migrated items whose title exactly matches a checklist in the same folder (`i-bus`, `i-tea`) be linked to it? Currently not (see §5).
- The nested-roll-up rule (direct vs recursive totals) is Developer 4's concern; this layer stores only flat rows.
