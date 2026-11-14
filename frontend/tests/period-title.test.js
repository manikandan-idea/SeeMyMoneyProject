import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPeriodTitle } from '../src/utils/format.js'

test('period page heading comes from the device date', () => {
  const d = new Date(2026, 10, 14) // Saturday, 14 November 2026 (local time)
  assert.equal(formatPeriodTitle('daily', d), 'Saturday, 14 November 2026')
  assert.equal(formatPeriodTitle('monthly', d), 'November 2026')
  assert.equal(formatPeriodTitle('yearly', d), '2026')
  assert.equal(formatPeriodTitle('occasional', d), null)
  assert.equal(formatPeriodTitle(null, d), null)
  assert.equal(formatPeriodTitle('daily', new Date(2027, 0, 1)), 'Friday, 1 January 2027')
})
