import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useOnlineStatus } from '../useOnlineStatus'

describe('useOnlineStatus', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = navigator.onLine
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
  })

  it('reflects navigator.onLine at mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('flips to false on an offline event and back to true on online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe(false)

    act(() => window.dispatchEvent(new Event('online')))
    expect(result.current).toBe(true)
  })

  it('removes its listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())

    const addedTypes = addSpy.mock.calls.map(([type]) => type)
    expect(addedTypes).toContain('online')
    expect(addedTypes).toContain('offline')

    unmount()
    const removedTypes = removeSpy.mock.calls.map(([type]) => type)
    expect(removedTypes).toContain('online')
    expect(removedTypes).toContain('offline')
  })
})
