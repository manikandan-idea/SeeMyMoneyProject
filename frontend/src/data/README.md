# src/data — persistence layer

Local-only, offline-first storage for See My Money. IndexedDB database **`see-my-money`**, version **1**, `AppState.schemaVersion` **1**.

| File | Purpose |
| --- | --- |
| `schema.js` | Constants, store/index layout, `createId`, local-date helpers, `validateAppState` |
| `migrations.js` | `migrateLegacyData` (old nested `sampleData` → normalized AppState), `upgradeStoredState` |
| `storage.js` | The **only** file that touches IndexedDB: `loadAppState`, `saveAppState`, `createAppStoreController` |
| `useAppStore.jsx` | React hook over one shared store |
| `sampleData.js` | **Legacy** nested data. Only read by the first-run import. Keep it until you consciously drop the first-run sample import. |

## Object stores

`folders`, `checklists`, `transactions`, `savingAreaEntries` (keyPath `id`) and `meta` (keyPath `key`: `schema`, `bootstrap`).
Indexes are listed in `STORE_DEFINITIONS`. Notes: IndexedDB cannot index `null`/booleans, so `parentFolderId`, `folderId`, `checklistId` and `periodKey` indexes only contain non-null rows, and the `hidden` index uses an internal numeric `__hidden` (0/1). Internal fields start with `__` and never appear in `AppState`.

## Using it

```js
import { useAppStore } from './data/useAppStore.jsx'

const { state, status, error, commit, reload, dismissError } = useAppStore()
// state === null until loaded. status: 'loading' | 'ready' | 'saving' | 'error'

await commit((current) => createTransaction(current, { ... }))   // pure updater, returns NEW state
```

- `commit` calls are queued one at a time, so rapid taps never lose an update.
- `state` changes only **after** IndexedDB has committed. While saving, `state` is still the previous saved state.
- On failure `commit` rejects, `error` is set, `state` stays at the last saved version, and the next commit works normally. Event handlers should `.catch(() => {})` (the error is already in `error`) or use the rejection to keep a form open.
- Updaters must be pure: never mutate `current`.
- Every save is validated first (`validateAppState`). Invalid data is rejected with an `AppStateValidationError` listing the problems, and nothing is written.

## Rules the layer enforces

- Never deletes a transaction because a checklist/folder was removed (it only writes the state it is given; transactions have no foreign keys).
- Sample data is imported once, in one transaction, guarded by `meta.bootstrap`. Emptying the database later does not re-import.
- A save writes only what this tab changed, so a second open tab cannot wipe rows that the first tab saved. Other tabs are told to reload through a `BroadcastChannel`.
- Amounts are plain rupee numbers; no paise conversion.

## Tests

```bash
node --test "src/data/__tests__/*.test.js"
```

Uses `node:test` and a small in-memory IndexedDB fake (`__tests__/fakeIndexedDB.js`); no dependencies.
