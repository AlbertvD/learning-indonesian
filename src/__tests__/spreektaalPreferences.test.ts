import { describe, it, expect, beforeEach } from 'vitest'
import { getSpreektaalEnabled, setSpreektaalEnabled } from '@/lib/spreektaalPreferences'

describe('spreektaalPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to true when unset', () => {
    expect(getSpreektaalEnabled()).toBe(true)
  })

  it('round-trips true', () => {
    setSpreektaalEnabled(true)
    expect(getSpreektaalEnabled()).toBe(true)
  })

  it('round-trips false', () => {
    setSpreektaalEnabled(false)
    expect(getSpreektaalEnabled()).toBe(false)
  })
})
