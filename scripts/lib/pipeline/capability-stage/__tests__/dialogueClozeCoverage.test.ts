/**
 * dialogueClozeCoverage.test.ts — Slice 3 Task 8: CS22 dialogue-cloze coverage
 * gate. The DB-state successor of lint-staging's checkDialogueClozes — surfaces
 * eligible dialogue lines whose in-stage generation failed (no dialogue_clozes
 * row landed) so the gap is never silently dropped (m-2).
 */

import { describe, it, expect } from 'vitest'
import { validateDialogueClozeCoverage } from '../validators/dialogueClozeCoverage'

describe('validateDialogueClozeCoverage (CS22)', () => {
  it('returns no findings when every eligible line generated a cloze', () => {
    expect(validateDialogueClozeCoverage([])).toEqual([])
  })

  it('emits one CS22 error per failed (eligible-but-ungenerated) line', () => {
    const findings = validateDialogueClozeCoverage([
      'lesson-5/section-3/line-0',
      'lesson-5/section-3/line-4',
    ])
    expect(findings).toHaveLength(2)
    for (const f of findings) {
      expect(f.gate).toBe('CS22')
      expect(f.severity).toBe('error')
    }
    expect(findings[0].message).toContain('lesson-5/section-3/line-0')
    expect(findings[0].context).toMatchObject({ sourceLineRef: 'lesson-5/section-3/line-0' })
  })

  it('names the source_line_ref so the gap is actionable (re-publish / --regenerate)', () => {
    const [f] = validateDialogueClozeCoverage(['lesson-7/section-2/line-9'])
    expect(f.message.toLowerCase()).toContain('dialogue')
    expect(f.message).toContain('lesson-7/section-2/line-9')
  })
})
