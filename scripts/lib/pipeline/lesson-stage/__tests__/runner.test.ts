import { describe, it, expect } from 'vitest'
import { runLessonStage } from '../index'

describe('runLessonStage', () => {
  it('is exported from the barrel', () => {
    expect(typeof runLessonStage).toBe('function')
  })

  it.skip('orchestrates validators + classifier + adapter + audio (commit 8)', () => {
    // Real test lands at commit 8.
  })
})
