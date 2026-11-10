// useAppStore() — React binding for the IndexedDB-backed AppState.
//
// One shared store per page: every component that calls useAppStore() sees the same
// state. The serialized commit queue lives in storage.js (createAppStoreController)
// so it can be tested without React.
//
//   const { state, status, error, commit, reload, dismissError } = useAppStore()
//   await commit((current) => createTransaction(current, {...}))
//
// `state` is null until the first load finishes and only ever changes AFTER a commit
// has been written to IndexedDB. `commit` rejects if the save fails; `error` carries
// the same failure for the UI, and `state` stays at the last saved version.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { createAppStoreController, getDefaultStorage } from './storage.js'

let controller = null

function getController() {
  if (!controller) {
    const storage = getDefaultStorage()
    controller = createAppStoreController({
      load: storage.loadAppState,
      save: storage.saveAppState,
      subscribeExternal: storage.onExternalChange,
    })
  }
  return controller
}

export function useAppStore() {
  const store = getController()
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    store.start() // idempotent (safe under React StrictMode)
  }, [store])

  return useMemo(
    () => ({
      state: snapshot.state,
      status: snapshot.status,
      error: snapshot.error,
      commit: store.commit,
      reload: store.reload,
      dismissError: store.dismissError, // extra (not in the contract): hides the error banner
    }),
    [snapshot, store],
  )
}
