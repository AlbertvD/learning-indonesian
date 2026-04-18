import { describe, it, expect, beforeEach } from 'vitest'
import { getListeningEnabled, setListeningEnabled } from '@/lib/listeningPreferences'

describe('listeningPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to true when unset', () => {
    expect(getListeningEnabled()).toBe(true)
  })

  it('round-trips true', () => {
    setListeningEnabled(true)
    expect(getListeningEnabled()).toBe(true)
  })

  it('round-trips false', () => {
    setListeningEnabled(false)
    expect(getListeningEnabled()).toBe(false)
  })
})
