import { describe, expect, it } from 'vitest'
import { en, nl } from '@/lib/i18n'

describe('learning experience copy', () => {
  it('has learner-facing posture, queue, and skill-label copy in Dutch', () => {
    expect(nl.session.posture.lightRecovery).toBe('Rustig opbouwen')
    expect(nl.session.pipelineDryingUp).toContain('Open de volgende les')
    expect(nl.session.skillLabels.choice).toBe('Kiezen')
  })

  it('keeps English copy shape aligned with Dutch copy', () => {
    expect(en.session.posture.comeback).toBeTruthy()
    expect(en.session.pipelineDryingUp).toContain('Open the next lesson')
    expect(Object.keys(en.session.skillLabels)).toEqual(Object.keys(nl.session.skillLabels))
  })
})
