import { describe, expect, it } from 'vitest'
import { isSourceProgressSatisfied } from '@/lib/pedagogy/sourceProgressGates'

describe('source progress gates', () => {
  it('allows capabilities with no lesson sequencing requirement', () => {
    expect(isSourceProgressSatisfied({
      requiredSourceProgress: { kind: 'none', reason: 'not_lesson_sequenced' },
      sourceProgress: [],
      evidence: [],
    })).toEqual({ satisfied: true, reason: 'no_source_progress_required' })
  })

  it('requires the requested section progress state', () => {
    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'lesson-1/section-a',
        requiredState: 'section_exposed',
      },
      sourceProgress: [{
        sourceRef: 'lesson-1/section-a',
        sourceSectionRef: 'section-a',
        currentState: 'opened',
        completedEventTypes: ['opened'],
      }],
      evidence: [],
    }).satisfied).toBe(false)

    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'lesson-1/section-a',
        requiredState: 'section_exposed',
      },
      sourceProgress: [{
        sourceRef: 'lesson-1/section-a',
        sourceSectionRef: 'section-a',
        currentState: 'section_exposed',
        completedEventTypes: ['opened', 'section_exposed'],
      }],
      evidence: [],
    }).satisfied).toBe(true)
  })

  it('allows remediation through recognition evidence when configured', () => {
    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'learning_items/item-1',
        requiredState: 'intro_completed',
      },
      sourceProgress: [],
      evidence: [{ capabilityKey: 'cap-1', sourceRef: 'learning_items/item-1', skillType: 'recognition', successfulReviews: 2 }],
      allowEvidenceBypass: true,
    })).toEqual({ satisfied: true, reason: 'satisfied_by_evidence' })
  })

  it('does not allow unrelated recognition evidence to bypass source progress', () => {
    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'learning_items/item-1',
        requiredState: 'intro_completed',
      },
      sourceProgress: [],
      evidence: [{ capabilityKey: 'cap-2', sourceRef: 'learning_items/item-2', skillType: 'recognition', successfulReviews: 2 }],
      allowEvidenceBypass: true,
    })).toEqual({ satisfied: false, reason: 'missing_source_progress' })
  })

  it('does not treat unrelated exposure states as a linear progress ladder', () => {
    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'learning_items/item-1',
        requiredState: 'intro_completed',
      },
      sourceProgress: [{
        sourceRef: 'learning_items/item-1',
        sourceSectionRef: '__lesson__',
        currentState: 'heard_once',
        completedEventTypes: ['heard_once'],
      }],
      evidence: [],
    })).toEqual({ satisfied: false, reason: 'missing_source_progress' })

    expect(isSourceProgressSatisfied({
      requiredSourceProgress: {
        kind: 'source_progress',
        sourceRef: 'learning_items/item-1',
        requiredState: 'section_exposed',
      },
      sourceProgress: [{
        sourceRef: 'learning_items/item-1',
        sourceSectionRef: '__lesson__',
        currentState: 'pattern_noticing_seen',
        completedEventTypes: ['pattern_noticing_seen'],
      }],
      evidence: [],
    })).toEqual({ satisfied: false, reason: 'missing_source_progress' })
  })
})
