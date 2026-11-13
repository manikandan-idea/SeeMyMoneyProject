// "Advanced settings" block of the creation forms (card_records.html): a heading you
// tap to open, holding only "Record count" (whole number 1 - 999, default 1).
// Props: open, onToggle, value (text), onChange(text), bad (red border), onEnter()

import Svg from './Svg.jsx'

// Returns the whole number 1..999, or null when the text is not valid.
export function parseRecordCount(text) {
  const t = String(text).trim()
  const n = parseInt(t, 10)
  if (!(n >= 1 && n <= 999) || String(n) !== t) return null
  return n
}

function AdvancedSettings({ open, onToggle, value, onChange, bad, onEnter }) {
  return (
    <div className="fc__adv">
      <button type="button" className="fc__advbtn" aria-expanded={open} onClick={onToggle}>
        Advanced settings
        <span className={`fc__chev${open ? ' fc__chev--up' : ''}`}><Svg d="M6 9l6 6 6-6" size={14} /></span>
      </button>
      {open && (
        <div className="fc__advbox">
          <label>Record count</label>
          <input className={`fc__rc${bad ? ' fc__in--bad' : ''}`} type="number" min="1" step="1" inputMode="numeric"
            aria-label="Record count" value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }} />
        </div>
      )}
    </div>
  )
}

export default AdvancedSettings
