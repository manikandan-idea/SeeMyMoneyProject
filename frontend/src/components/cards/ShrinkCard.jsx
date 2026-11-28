// Shrinkable cards (from the "Shrinkable cards" design): the Checklists card and the Folders card
// can be SHRUNK to a short fixed-height box that scrolls inside the card, or EXPANDED to show
// everything. Shrunk shows a fade at the bottom and "↓ N more · scroll inside the card".
//   <ShrinkButton shrunk onToggle />   the Shrink / Expand button in the card header
//   <ShrinkCount n />                  the "· 5" next to the title
//   <ShrinkList shrunk maxHeight className>…rows…</ShrinkList>   the list itself
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import './shrinkCard.css'

export function ShrinkCount({ n }) {
  return <span className="shr__count">· {n}</span>
}

export function ShrinkButton({ shrunk, onToggle, count = 1 }) {
  if (count < 1) return null // nothing to shrink
  return (
    <button type="button" className="shr__btn" aria-pressed={shrunk} onClick={onToggle}
      title={shrunk ? 'Show every item in this card' : 'Show a short scrolling box'}>
      {shrunk ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9l5-5 5 5" /><path d="M7 15l5 5 5-5" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4l5 5 5-5" /><path d="M7 20l5-5 5 5" /></svg>
      )}
      {shrunk ? 'Expand' : 'Shrink'}
    </button>
  )
}

export function ShrinkList({ shrunk, maxHeight = 152, className = '', children }) {
  const ref = useRef(null)
  const [more, setMore] = useState(0)
  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !shrunk) { setMore(0); return }
    const bottom = el.scrollTop + el.clientHeight
    const hidden = Array.from(el.children).filter((k) => k.offsetTop + k.offsetHeight / 2 > bottom).length
    setMore(hidden)
  }, [shrunk])
  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })
  const showMore = shrunk && more > 0
  return (
    <>
      <div className="shr">
        <div ref={ref} className={`${className} shr__list${shrunk ? ' is-shrunk' : ''}`}
          style={shrunk ? { maxHeight } : undefined} onScroll={measure}>
          {children}
        </div>
        {showMore && <div className="shr__fade" aria-hidden="true" />}
      </div>
      {showMore && <div className="shr__more" role="status">↓ {more} more · scroll inside the card</div>}
    </>
  )
}
