// src/__tests__/logger.sanitize.test.ts
//
// 2026-07-11 prod-ready audit ("ERROR-LOG SCRUBBING"): error_logs.error_message
// persists error.message verbatim, which can embed a leaked Supabase JWT,
// Authorization header, or query-string apikey/password. sanitizeErrorMessage
// is a pure function — no Supabase mock needed.
import { describe, it, expect } from 'vitest'
import { sanitizeErrorMessage } from '@/lib/logger'

describe('sanitizeErrorMessage', () => {
  it('redacts a JWT-shaped token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const message = sanitizeErrorMessage(`Auth failed for token ${jwt}`)

    expect(message).toBe('Auth failed for token [REDACTED_JWT]')
    expect(message).not.toContain('eyJ')
  })

  it('redacts a Bearer authorization value', () => {
    const message = sanitizeErrorMessage('Request failed: Authorization: Bearer sk-abc123XYZ789tokenvalue, status 401')

    expect(message).toBe('Request failed: Authorization: Bearer [REDACTED], status 401')
    expect(message).not.toContain('sk-abc123XYZ789tokenvalue')
  })

  it('redacts apikey/api_key/password query-param values', () => {
    const message = sanitizeErrorMessage(
      'fetch failed: https://api.supabase.duin.home/rest/v1/foo?apikey=verysecretkey123&password=hunter2&limit=10',
    )

    expect(message).toBe(
      'fetch failed: https://api.supabase.duin.home/rest/v1/foo?apikey=[REDACTED]&password=[REDACTED]&limit=10',
    )
  })

  it('redacts a long unbroken base64-ish run even outside a known shape', () => {
    const blob = 'A'.repeat(120)
    const message = sanitizeErrorMessage(`unexpected payload: ${blob} end`)

    expect(message).toBe('unexpected payload: [REDACTED] end')
  })

  it('leaves a clean message untouched', () => {
    const message = sanitizeErrorMessage('Failed to fetch lesson 12: network timeout')

    expect(message).toBe('Failed to fetch lesson 12: network timeout')
  })

  it('truncates to 500 characters after sanitizing', () => {
    // Space-separated so no single run trips the 100-char base64ish catch-all —
    // this test is isolating truncation, not the redaction rules above.
    const message = sanitizeErrorMessage('word '.repeat(120))

    expect(message).toHaveLength(500)
  })
})
