import { describe, expect, it } from 'vitest'
import {
  collectLessonCapabilityKeys,
  parseCapabilityReleaseReadinessArgs,
  summarizeCapabilityReleaseReadiness,
} from '../check-capability-release-readiness'

describe('capability release readiness planning', () => {
  it('requires an explicit lesson scope and rejects unknown arguments', () => {
    expect(parseCapabilityReleaseReadinessArgs(['--lesson', '1'])).toEqual({
      lesson: 1,
      sourceRef: 'lesson-1',
    })
    expect(() => parseCapabilityReleaseReadinessArgs([])).toThrow('--lesson is required')
    expect(() => parseCapabilityReleaseReadinessArgs(['--lesson'])).toThrow('--lesson requires a number')
    expect(() => parseCapabilityReleaseReadinessArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
  })

  it('derives lesson capability keys from page blocks instead of capability source_ref', () => {
    const keys = collectLessonCapabilityKeys({
      lessonPageBlocks: [
        {
          capability_key_refs: [
            'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
            'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl',
          ],
        },
        {
          capability_key_refs: ['cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl'],
        },
      ],
      relationshipCapabilities: [
        { canonical_key: 'cap:v1:item:learning_items/apa-kabar:text_recognition:id_to_l1:text:nl' },
      ],
    })

    expect(keys).toEqual([
      'cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl',
      'cap:v1:item:learning_items/akhir:text_recognition:id_to_l1:text:nl',
      'cap:v1:item:learning_items/apa-kabar:text_recognition:id_to_l1:text:nl',
    ])
  })

  it('blocks release when reader rows exist but no scoped ready capabilities exist', () => {
    const report = summarizeCapabilityReleaseReadiness({
      sourceRef: 'lesson-1',
      contentUnits: 12,
      lessonPageBlocks: 8,
      scopedCapabilityKeys: ['cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl'],
      capabilities: [
        { readiness_status: 'unknown', publication_status: 'draft' },
      ],
      capabilityArtifacts: 20,
      capabilityContentUnitRelationships: 4,
      sourceProgressRows: 0,
    })

    expect(report.releaseReady).toBe(false)
    expect(report.blockers).toContain('No ready/published capabilities are available for capability sessions.')
  })

  it('passes the core runtime gate when reader rows and scoped ready capabilities exist', () => {
    const report = summarizeCapabilityReleaseReadiness({
      sourceRef: 'lesson-1',
      contentUnits: 12,
      lessonPageBlocks: 8,
      scopedCapabilityKeys: ['cap:v1:item:learning_items/akhir:meaning_recall:id_to_l1:text:nl'],
      capabilities: [
        { readiness_status: 'ready', publication_status: 'published' },
      ],
      capabilityArtifacts: 20,
      capabilityContentUnitRelationships: 1,
      sourceProgressRows: 1,
    })

    expect(report.releaseReady).toBe(true)
    expect(report.blockers).toEqual([])
  })
})
