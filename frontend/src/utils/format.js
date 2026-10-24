// Formatting helpers shared across the app.

// 1250.5 -> "₹1,250.50" (Indian digit grouping)
export function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

// "2026-08-18" -> "18 Aug 2026"
export function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ISO timestamp -> "29 Aug 2026, 10:42 am"
export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
