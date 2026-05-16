import { describe, expect, it } from 'vitest'
import { en, nl } from '@/lib/i18n'

describe('learning experience copy', () => {
  it('keeps the queue-drying string available in Dutch', () => {
    expect(nl.session.pipelineDryingUp).toContain('Activeer de volgende les')
  })

  it('keeps the queue-drying string available in English', () => {
    expect(en.session.pipelineDryingUp).toContain('Activate the next lesson')
  })
})
