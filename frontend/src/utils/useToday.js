// useToday() -> local date key "YYYY-MM-DD" that changes when the device date changes:
// at midnight while the app is open, and when the app/tab becomes visible again.
// Pages use it so the date heading and the Today / This Month / This Year totals
// move on by themselves without a reload.

import { useEffect, useState } from 'react'

function dateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function useToday() {
  const [key, setKey] = useState(() => dateKey())
  useEffect(() => {
    let timer
    const schedule = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = setTimeout(() => { setKey(dateKey()); schedule() }, nextMidnight - now)
    }
    const refresh = () => { if (!document.hidden) setKey(dateKey()) } // same key -> no re-render
    schedule()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return key
}
