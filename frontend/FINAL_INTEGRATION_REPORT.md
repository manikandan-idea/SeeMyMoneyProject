# See My Money — Final Integration Report

Base: github.com/manikandan-idea/SeeMyMoneyProject (`frontend/`, main) + Developer 1–4 handoffs.

## Run
`npm install`, `npm run dev`, `npm test`, `npm run lint`, `npm run build`.

## Changed / new files
- Edited by integration: `src/App.jsx` (rewritten), `src/main.jsx`, `src/components/Header.jsx`, `src/App.css` (appended), `package.json` (added `test` script only), `README.md` (appended).
- Dev 1: `src/data/{schema,storage,migrations,useAppStore}.js(x)`, `src/data/README.md`, `src/data/__tests__/*`
- Dev 2: `src/domain/folderChecklist.js` (+test), `src/components/{AddFolderForm,ChecklistPanel,FolderCard,SectionView,HiddenView,OtherPanel,ItemRow}.jsx`, `folders.css`
- Dev 3: `src/domain/records.js`, `src/components/records/*`, `tests/records.test.js`
- Dev 4: `src/domain/analytics.js` (+test), `src/components/summary/*`, `src/components/SectionTile.jsx` (wording)
- New: `tests/integration.test.js`, `handoffs/HANDOFF_dev{1..4}.md` (the four HANDOFF files were renamed to avoid collision)
- Not changed: `public/sw.js`, manifest, `vite.config.js`, `index.html`, `sampleData.js`, `format.js`, `package-lock.json`.

## Collisions / resolutions
- No source file was changed by two developers. Only `HANDOFF.md` collided (Dev 3, Dev 4 and Dev 1 each shipped one) → renamed into `handoffs/`.
- No developer edited `App.jsx` or another restricted file.
- Dev 2's `SectionView` takes a different prop shape from the old one (normalized `state` + `actions`); `App.jsx` adapts it (all callbacks → `commit`).
- Dev 4's `DashboardView` replaces the inline dashboard; `SectionTile` is used inside it.
- Dev 1's `commit` returns a promise that rejects on failure; section callbacks swallow the rejection (the store exposes `error`, shown in a banner), History callbacks pass the rejection through so its dialogs show the error.

## Checks actually run
| Check | Result |
|---|---|
| `npm test` (Node 22 built-in runner, 95 tests: Dev 1–4 suites + 8 new integration tests) | **95 pass, 0 fail** |
| esbuild bundle of `src/main.jsx` (imports resolve, JSX compiles; react external) | OK |
| Server-render smoke of SectionView, HistoryView, HiddenView, DashboardView, SummaryView on migrated sample data | all render, INR shown |
| `npm ci` / `npm install` | **NOT RUN — package installs are blocked in this workspace** (npm aborted) |
| `npm run lint` (oxlint) | **NOT VERIFIED** |
| `npm run build` (Vite) | **NOT VERIFIED** — esbuild bundling is not a substitute |
| Real-browser flows (IndexedDB persistence, refresh, modals, offline) | **NOT VERIFIED** |

Acceptance checks 3–11 are covered by the pure-function tests in `tests/integration.test.js` on the migrated sample data (Tea 5×₹15 + 1×₹20 = 6 rows, usage 6, groups 5/1; default change; checklist delete keeps history; single-record delete; edit-one-amount regroup; Saving Area add/settle with IDs kept and idempotent; hide/restore; separate totals). Checks 1, 2 and 12 (refresh persistence, one-time bootstrap in a real browser, production build) are NOT VERIFIED end to end; Dev 1's fake-IndexedDB tests cover the bootstrap logic.

## Known issues / open items
1. **Daily/monthly/yearly auto-submit and occasional "Submit folder"** from the original app are not carried over (Dev 2 replaced submit with hide; Dev 1 never auto-settles). `periodKey` is stored; the period rollover rule is undefined in the contract.
2. **No settlement UI**: `settleSavingAreaEntries` exists but nothing calls it (target/period workflow undefined).
3. Top-level folders cannot be added to a Saving Area (no owner folder at section root).
4. Legacy sample rows `i-tea` / `i-bus` are not linked to their checklists (would be a guess), so their Usage Count is 0.
5. Folder totals: section root = recursive, opened folder/card = direct (original convention). Analytics also returns a `recursive` field if you want to flip it.
6. Rows with unknown `transactionDate` are excluded from date-filtered views.
7. Dev 2 added `+ Edit`, `+ Add Items`, ✏️ and per-row default-amount controls per the contract; please confirm placement.
8. `public/sw.js` unchanged; it caches the shell only and never touches IndexedDB. Registration now exists in `main.jsx` (production only). Offline-after-first-load is NOT VERIFIED.
9. Header search box is still display-only.

## Update: period-page layout (from PROJECT_MASTER_CONTEXT.md)
- App now opens on **Today**. Top tabs: Today, This Month, This Year, Infrequent Items, Settled Items (new `src/components/period/PeriodPage.jsx`).
- Each page shows three separate boxes: **Spend / Received / Savings** (read from transactions by type and `transactionDate`), a **Checklist** section (templates of that frequency, with one-tap `+ ₹default`) and a **Folders** section (top-level folders of that usage, with Add Folder; opening one shows the same folder in the existing folder view via the new optional `initialFolderId` prop on `SectionView`).
- Header: brand → Today; History and Hidden kept; the Summary button and the old three-tile dashboard were removed from navigation (files still in the repo, unused).
- Not done / open: page-level "Add Checklist" (data model needs a folder for every checklist); **Settled Items** is a placeholder (rules undecided); Infrequent vs Occasional (5 vs 6 tabs) undecided; auto-submit/finalisation not implemented; History kept only because deleting a single record needs it.
- Checks: `npm test` 95/95 pass; esbuild bundle OK; server-render of all five tabs OK. Lint, Vite build and browser use still NOT VERIFIED.

## Update 2: folder and checklist behaviour (from PROJECT_MASTER_CONTEXT.md)
- **Checklist on a page, no folder**: a checklist can now sit directly on Today / This Month / This Year (`folderId: null`). One data-contract change: `schema.js` accepts `checklist.folderId === null`; `createChecklistTemplate` / `updateChecklistTemplate` handle it (its section follows its type). Records, Other, default edit, delete and usage count reuse `ChecklistPanel` (same behaviour as inside a folder; delete still removes only the template).
- **Checklist creation**: Description + Amount, plus Type (Spend / Received / Savings). On a page the default is Spend; inside a folder the default is that folder's type. Frequency is never asked: it comes from the page (Today = daily, This Month = monthly, This Year = yearly).
- **Folder view**: shows three boxes Spend / Received / Savings (direct totals of that folder, nested folders excluded), "← Back", Checklist section and nested Folders together.
- Tests: 96/96 pass (new: page-level checklist). esbuild bundle OK; five tabs server-render OK. Lint, Vite build, browser NOT VERIFIED.
- Still open: Settled Items content, Infrequent vs Occasional, nested-folder roll-up, auto-submit.

## Update 3: Saving Area on every folder and every page; wording; fixes
- **Saving Area everywhere**: new `src/components/SavingArea.jsx` (always visible, `+ Add Items` picker, grouped list ×count). Shown in every opened folder and on Today / This Month / This Year / Infrequent Items. A period page is treated as a folder through virtual owners `page:daily`, `page:monthly`, `page:yearly`, `page:occasional` (`PAGE_OWNER_IDS`, `pageOwnerId()` in `folderChecklist.js`); these are not stored folders, only the `ownerFolderId` of entries. Entries are still separate rows, never money; settlement can move page entries (`settleSavingAreaEntries`) with IDs kept.
- **Wording from the master file**: Spend / Received / Savings everywhere (boxes, History filter and badges, Hidden page, folder breadcrumb), `Add Folder`, `Add Checklist`, `← Back`.
- **Fixes**: opening a folder from a page now has that page as the top of the breadcrumb (not the old Income/Expense list); if the folder disappears (hidden) you are returned to the page.
- Tests 97/97 pass (new: Saving Area on folder + page). esbuild bundle OK; all tabs render with Saving Area. Lint, Vite build, browser NOT VERIFIED.

## Update 4: Saving Area page (Folder View look)
- Tapping the Saving Area card (in any folder or on Today / This Month / This Year / Infrequent Items) opens `SavingAreaPage.jsx`, built from `PROJECT_MASTER_CONTEXT (4)`: back arrow, top box, three cards (Spend / Received / Savings), Checklist card (name · `N records · ₹total` when N > 1 · ₹amount ✎ · 🗑) and Folders card (name, "N checklists · N folders", records box, 🗑, three chips). No Add buttons on this page; `+ Add Items` stays on the card (it does not open the page). Back returns to the same folder or page.
- 🗑 removes ONE entry (`removeSavingAreaEntry`, new pure function); a card disappears when its last entry is removed. The original checklist/folder, transactions and other entries are untouched.
- Entries have no amount of their own, so amounts shown are the checklist's current default; the three cards add those up for display only ("not recorded money"). The ✎ edits that checklist's reusable default (future records only). The master file's "split into a new card" rule needs per-entry amounts and is NOT applied. Folder-name pencil omitted (action undefined in the master file).
- Tests 98/98 pass; esbuild bundle OK; page renders on sample data. Lint, Vite build, browser NOT VERIFIED.

## Update 5: folder card and checklist card from card_records.html + folder_creation_handoff.md
- New `src/components/cards/` (`FolderCard.jsx` recursive, `ChecklistSection.jsx`, `ChecklistRow.jsx`, `cards.css`). Folders on every period page are now these cards: they open IN PLACE (tap icon/name or `+ Edit`; `✓ Done` closes), show Checklists / Folders / Saving Area inside, and have a colour per depth (blue, green, amber).
- Folder card: `[Records] icon + name + counts · + Edit/Done · + Add item · 🗑`, stats Spend / Received / Savings below. Records box hidden on the outermost folder. `+ Edit` on a closed inner folder creates a same-name twin below (not auto-opened). Add folder form = optional name only (auto "Folder N"). `+ Add item` = one more record = one Saving Area entry of that folder (creates nothing inside); Records = 1 + those entries; disabled while open. 🗑 with Records ≥ 2 removes one such entry; at 1 it HIDES the folder (restore from Hidden) instead of destroying it.
- Checklist card, one line: `Records | name | ₹default ✎ | Other | + | 🗑`. Records = real number of recorded transactions. Create form: Amount first (required), name optional (auto "Checklist N"), Type (Spend preselected), blueprint only. `+` records the default; `Other` records one transaction at another amount (default unchanged); ✎ changes the default for future records. 🗑 deletes only the template after confirmation; all records stay in History.
- Checklist section on a period page uses the same card (page-level checklists, no folder).
- NOW PORTED (requested by the owner, previously held back): "Other" adds a new same-name row directly below (typed amount = its first record and its default); ← → on checklist rows and folder cards; 🗑 on a checklist row removes ONE record when it has 2 or more (otherwise deletes the reusable checklist); "Record count" in Advanced settings of the checklist and folder forms (stored as `recordCount`, shown in the name tooltip); "+ Edit" on a closed inner folder makes an open twin directly below. Owner's decision: undo and 🗑-remove-one now delete the latest transaction outside History.
- Still NOT ported: Savings = Received − Spend (contract: Saving is never Income − Expense; real Saving totals are shown); the old one-time folder amount `+ Edit` from the contract (replaced by the handoff's Edit/Done).
- `SectionView` (old folder page) is no longer reached from the pages; left in the repo.
- Also fixed after real-browser testing: header made the page scroll sideways on phones; folder/checklist rows now fit 360px.
- VERIFIED in real Chromium (esbuild browser bundle + real IndexedDB, 390px and 360px): opens on Today; add page-level checklist and record; open folder; add checklist Tea15 (₹15) ×5 + Other ₹20 → Records 6; add inner folder; + Add item → Records 2; twin created; Saving Area card opens the page and Back returns; reload keeps everything; History shows the 6 Tea15 rows; no console errors; no horizontal overflow. Test script: `tests/browser-flow.e2e.cjs.txt`. Unit tests 98/98. Vite build and oxlint still NOT RUN (installs blocked).
