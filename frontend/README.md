# See My Money

A private, offline money notebook. Record income, expenses and savings (even a ₹10 tea),
organise them in folders, and see where your money goes. Records stay on the phone.

## Run it

```bash
npm install
npm run dev        # development
npm run build      # production build into dist/
npm run preview    # try the production build (offline support only works here, not in dev)
```

## How it works

| Area | File(s) |
| --- | --- |
| Screens (Home, History, Summary, Settings) | `src/views/` |
| Reusable pieces (forms, folder cards, checklist…) | `src/components/` |
| **Database access (IndexedDB) — the only file that touches storage** | `src/data/storage.js` |
| App state; every save is confirmed by the database before "Saved" shows | `src/data/useStore.jsx` |
| Pure logic: reports, backup validation, data-health checks | `src/data/logic.js` |
| Money in paise, local-date handling, unique IDs | `src/utils/` |
| Offline support (service worker + manifest) | `public/sw.js`, `public/manifest.webmanifest` |

### Key rules
- **Transactions and folders are separate.** Every entry is one record in a flat list; a folder is only a label.
  Hiding, submitting or restarting a folder never moves or deletes entries.
- Daily / monthly / yearly folders "start fresh" because they show only entries dated in the current day / month / year.
- Money is stored as whole **paise** (integers). Dates are local `YYYY-MM-DD` strings, so no timezone shifts.
- Income, Expense and Saving are always totalled separately. There is no combined balance.
- Backup files are versioned JSON, fully validated before a restore, and applied in one all-or-nothing transaction.

### Moving to Android later
Wrap the built app with Capacitor. Then replace the body of `src/data/storage.js` with an SQLite
implementation (same `loadAll` / `write` functions). No other file needs to change.
