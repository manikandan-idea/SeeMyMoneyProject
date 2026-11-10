# HANDOFF — Developer 2: Folder, Checklist & Saving Area

## Changed / new files (paths relative to `frontend/`)
- `src/domain/folderChecklist.js` (new) — pure domain operations and selectors
- `src/domain/folderChecklist.test.js` (new) — 14 Node tests
- `src/components/SectionView.jsx`, `ChecklistPanel.jsx`, `FolderCard.jsx`, `HiddenView.jsx`, `OtherPanel.jsx`, `ItemRow.jsx`, `AddFolderForm.jsx` (rewritten / edited)
- `src/components/folders.css` (new; imported by the components, no App.css change needed)
- Not changed: `Breadcrumb.jsx` (works as-is). Not touched: `App.jsx`, `Header.jsx`, CSS owned by Dev 5, `src/data/*`, `package.json`.
- The components no longer import `data/sampleData.js`.

## Domain exports (`src/domain/folderChecklist.js`)
Contract exports, exact signatures: `createFolder`, `updateFolder`, `setFolderHidden`, `duplicateFolderStructure`, `createChecklistTemplate`, `updateChecklistTemplate`, `deleteChecklistTemplate`, `addSavingAreaEntry`, `settleSavingAreaEntries`, `selectFolderTree`.
Additive extras: `selectHiddenFolders(state)`, `groupSavingAreaEntries(entries)` (display-only grouping), `periodKeyFor(usage, date?)` (local date), `makeId()`; optional `checklist: [{ title, defaultAmount }]` field on `createFolder` input so "New folder" is one commit.

Behaviour notes
- All writes return a new state; the input is never mutated. Invalid input **throws** an `Error` (the UI validates first). Unknown id on `deleteChecklistTemplate` and a repeated settlement return the same state object (no-op).
- Checklist `transactionType` defaults to the folder's section; `frequency` defaults to the folder's usage when daily/monthly/yearly, else `null`.
- `updateFolder` only patches `name`, `usage`, `frequency`, `othersEnabled`. `updateChecklistTemplate` only patches `title`, `defaultAmount`, `transactionType`, `frequency`.
- `deleteChecklistTemplate` passes `transactions` and `savingAreaEntries` through untouched.
- `duplicateFolderStructure` copies the folder, inner folders and checklist templates as a sibling with new IDs, visible, fresh `periodKey`. No transactions or Saving Area entries.
- `settleSavingAreaEntries` validates the target first, rejects a target in another section, keeps entry IDs and order, and is idempotent.
- `selectFolderTree(state, sectionId)` → `{ sectionId, folders, byId }`; each node = folder + `path` (ancestor ids), `folders`, `checklists`, `savingAreaEntries`. Hidden folders are included (`.hidden`).

## Props / callbacks Developer 5 must pass
`SectionView({ sectionId, sectionTitle, sectionIcon, state, onBack, actions, getUsageCount?, getFolderRecords?, getTotals? })`
- `getUsageCount(checklistId)` → Dev 3's `getChecklistUsageCount(state, id)`.
- `getFolderRecords(folderId | null)` → transactions to list (`null` = section root). Records with `source === 'other'` show in the Other panel; the rest in the list.
- `getTotals(folderId | null)` → `{ total, count }` (Dev 4). Not supplied → amounts are simply hidden. Original convention: section root recursive, opened/card folders direct — Dev 5 decides.
- `actions` (bind `sectionId` yourself):
  - `createFolder({ parentFolderId, name, usage, frequency, othersEnabled, checklist })`
  - `updateFolder(folderId, patch)` · `setFolderHidden(folderId, hidden)` · `duplicateFolder(folderId)`
  - `createChecklist({ folderId, title, defaultAmount })` · `updateChecklist(checklistId, patch)` · `deleteChecklist(checklistId)`
  - `addSavingAreaEntry({ ownerFolderId, sourceType, sourceId })`
  - `recordChecklist({ folderId, checklistId, amount, source })` — `source` is `'checklist'` (default amount) or `'checklist-other'` (override)
  - `recordOther({ folderId, amount, description })` → `source: 'other'`, `checklistId: null`
  - `recordFolderOneTime({ folderId, amount, description })` → `source: 'folder-one-time'`
  - `addEntry({ folderId, description, amount })` → `source: 'manual'` (from the existing `+ Entry` form; `folderId` is `null` at section root)
- `HiddenView({ state, onBack, onRestore(folderId), getFolderTotals? })`
- `ChecklistPanel`, `FolderCard`, `OtherPanel`, `ItemRow`, `AddFolderForm` are used by `SectionView`; their props are documented in each file header.
- None of my components create or delete transactions; they only call the callbacks.

## Saving Area data flow
UI 🐖 on a checklist row → `addSavingAreaEntry({ ownerFolderId: openFolder, sourceType: 'checklist', sourceId })`. "+ Add Items" on an inner folder card → same with `sourceType: 'folder'`. Each click = one new entry row; the panel groups them for display ("Tea ×2"). Entries never touch `transactions`.

## Open behaviours / mismatches (please read)
1. **Checklist ＋ button.** Old source: ＋ opened a modal prefilled with the default. Contract: Record uses the default directly. Now: `＋ ₹default` records immediately; `Other` opens the one-time-amount dialog (default unchanged).
2. **Controls absent from the old source** (`+ Edit`, `+ Add Items`, permanent ✏️, `Add Checklist`, default-amount ✏️) were added where the contract names them: `+ Edit` / ✏️ / `Add again` in the open folder's heading, `+ Add Items` on inner folder cards, default ✏️ per checklist row. Confirm placement.
3. **Top-level folders cannot be added to a Saving Area**: an entry needs an owner folder and none exists at section root. `+ Add Items` therefore shows only on cards inside an open folder.
4. **Settlement has no UI.** The target/period action is not defined, so only the pure primitive exists (no extra period hierarchy invented).
5. **Occasional "Submit folder"** previously moved records and deleted one-time folders. Now it only hides the folder (nothing deleted; records already carry `folderId`). Daily/monthly/yearly auto-submit on a new period is **not** implemented here; `periodKey` is stored for whoever owns that rule.
6. Renaming via ✏️ issues one `updateFolder` and/or several `updateChecklist` calls (separate commits). Saving Area `titleSnapshot` is not changed by a rename (snapshot).
7. `AddForm.jsx` (`+ Entry`) is not in my ownership and is unchanged.
8. Legacy `sampleData.js` folder helpers are no longer used by these components.

## Tests actually run
- `node --test src/domain/folderChecklist.test.js` → **14 pass, 0 fail** (immutability, nesting, validation, hide/restore, duplicate, template delete leaves transactions/Saving Area alone, separate Saving Area rows, settlement idempotence + same IDs + cross-section rejection, tree selectors).
- Components bundled with esbuild and exercised in headless Chromium (390px wide) through a throwaway harness with a stand-in transaction recorder: open folder, record default ×2, Other override, edit default, Add Checklist, Saving Area ×3 with grouping, folder `+ Edit`, standalone Other, Escape closes dialogs, rename, delete template, nested folder, inner folder → Saving Area, Add again, hide/restore → **15/15 checks passed, no console errors**. The harness is not included in the zip.
- **NOT RUN:** `npm run lint` and `npm run build` — the supplied `node_modules` contains only Windows binaries (oxlint/rolldown) and there was no network to reinstall. Dev 5 must run both. No `test` script exists in `package.json`; run `node --test src/domain/folderChecklist.test.js` (or bare `node --test` from `frontend/`).
