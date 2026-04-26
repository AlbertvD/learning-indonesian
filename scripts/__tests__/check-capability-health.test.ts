import { describe, expect, it } from 'vitest'
import {
  buildCapabilityHealthReport,
  checkCapabilityHealthSnapshot,
  filterScopedContentUnits,
  getCapabilityHealthExitCode,
  loadStagedContentSnapshot,
  parseCapabilityHealthArgs,
} from '../check-capability-health'

describe('capability health exit code planning', () => {
  it('exits zero for report mode even when blocked content exists', () => {
    expect(getCapabilityHealthExitCode({
      strict: false,
      criticalCount: 1,
    })).toBe(0)
  })

  it('exits nonzero in strict mode for critical findings', () => {
    expect(getCapabilityHealthExitCode({
      strict: true,
      criticalCount: 1,
    })).toBe(1)
  })

  it('exits zero in strict mode without critical findings', () => {
    expect(getCapabilityHealthExitCode({
      strict: true,
      criticalCount: 0,
    })).toBe(0)
  })

  it('requires a path after --staging', () => {
    expect(() => parseCapabilityHealthArgs(['--staging'])).toThrow('--staging requires a path')
  })

  it('fails closed for unknown arguments', () => {
    expect(() => parseCapabilityHealthArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
  })

  it('parses lesson scope for DB-backed runtime health', () => {
    expect(parseCapabilityHealthArgs(['--lesson', '1', '--strict'])).toEqual({
      strict: true,
      mode: 'db',
      lesson: 1,
      sourceRef: 'lesson-1',
    })
  })

  it('keeps explicit staging mode for staged-file health', () => {
    expect(parseCapabilityHealthArgs(['--staging', 'scripts/data/staging/lesson-9'])).toEqual({
      strict: false,
      mode: 'staging',
      stagingPath: 'scripts/data/staging/lesson-9',
    })
  })

  it('fails ready/published capabilities that have no approved artifact path', () => {
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        sourceRef: 'learning_items/makan',
        capabilityType: 'meaning_recall',
        skillType: 'meaning_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['meaning:l1'],
      }],
      artifacts: [],
    })

    expect(report.critical).toContainEqual(expect.objectContaining({
      rule: 'ready_capability_missing_approved_artifact',
    }))
  })

  it('keeps valid accepted-answer values payloads eligible for runtime health', () => {
    const capabilityKey = 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'form_recall',
        skillType: 'form_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['accepted_answers:id'],
      }],
      artifacts: [{
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'accepted_answers:id',
        qualityStatus: 'approved',
        artifactJson: { values: ['makan'] },
      }],
    })

    expect(report.critical).toEqual([])
  })

  it('fails approved artifacts with invalid artifact-kind payload shapes', () => {
    const capabilityKey = 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'form_recall',
        skillType: 'form_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['accepted_answers:id'],
      }],
      artifacts: [{
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'accepted_answers:id',
        qualityStatus: 'approved',
        artifactJson: { value: 'makan' },
      }],
    })

    expect(report.critical).toContainEqual(expect.objectContaining({
      rule: 'ready_capability_invalid_approved_artifact_payload',
    }))
  })

  it('fails ready/published capabilities that cannot resolve an exercise render plan', () => {
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        sourceRef: 'learning_items/makan',
        capabilityType: 'meaning_recall',
        skillType: 'meaning_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['meaning:l1'],
        exerciseAvailability: { meaning_recall: false },
      }],
      artifacts: [{
        capabilityKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        sourceRef: 'learning_items/makan',
        artifactKind: 'meaning:l1',
        qualityStatus: 'approved',
        artifactJson: { value: 'eten' },
      }],
    })

    expect(report.critical).toContainEqual(expect.objectContaining({
      rule: 'ready_capability_unresolvable_exercise',
    }))
  })

  it('fails ready/published capabilities with unknown source progress refs', () => {
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: 'cap:v1:item:learning_items/minum:text_recognition:id_to_l1:text:nl',
        sourceRef: 'learning_items/minum',
        capabilityType: 'text_recognition',
        skillType: 'recognition',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['base_text'],
        requiredSourceProgress: {
          kind: 'source_progress',
          sourceRef: 'lesson-1/unknown-section',
          requiredState: 'section_exposed',
        },
      }],
      artifacts: [{
        capabilityKey: 'cap:v1:item:learning_items/minum:text_recognition:id_to_l1:text:nl',
        sourceRef: 'learning_items/minum',
        artifactKind: 'base_text',
        qualityStatus: 'approved',
        artifactJson: { value: 'minum' },
      }],
    })

    expect(report.critical).toContainEqual(expect.objectContaining({
      rule: 'ready_capability_unknown_source_progress_ref',
    }))
  })

  it('reports draft/unknown capabilities as warnings instead of blockers', () => {
    const report = checkCapabilityHealthSnapshot({
      knownSourceRefs: ['learning_items/makan'],
      capabilities: [{
        canonicalKey: 'cap:v1:item:learning_items/makan:meaning_recall:id_to_l1:text:nl',
        sourceRef: 'learning_items/makan',
        capabilityType: 'meaning_recall',
        skillType: 'meaning_recall',
        readinessStatus: 'unknown',
        publicationStatus: 'draft',
        requiredArtifacts: ['meaning:l1'],
      }],
      artifacts: [],
    })

    expect(report.critical).toEqual([])
    expect(report.warnings).toContainEqual(expect.objectContaining({
      rule: 'capability_not_runtime_schedulable',
    }))
  })

  it('filters DB content units by lesson block source context instead of slug alone', () => {
    const scoped = filterScopedContentUnits({
      lessonSourceRef: 'lesson-1',
      blocks: [{
        source_refs: ['learning_items/makan'],
        content_unit_slugs: ['item-makan'],
      }],
      contentUnits: [
        {
          id: 'unit-lesson-1',
          source_ref: 'learning_items/makan',
          source_section_ref: 'lesson-1/section-vocabulary',
          unit_slug: 'item-makan',
        },
        {
          id: 'unit-lesson-2-collision',
          source_ref: 'learning_items/makan',
          source_section_ref: 'lesson-2/section-vocabulary',
          unit_slug: 'item-makan',
        },
        {
          id: 'unit-wrong-source',
          source_ref: 'learning_items/minum',
          source_section_ref: 'lesson-1/section-vocabulary',
          unit_slug: 'item-makan',
        },
      ],
    })

    expect(scoped.map(unit => unit.id)).toEqual(['unit-lesson-1'])
  })

  it('derives lesson-aware grammar pattern refs and examples from staged descriptions', async () => {
    const { snapshot } = await loadStagedContentSnapshot('scripts/data/staging/lesson-9')
    const pattern = snapshot.grammarPatterns.find(item => item.id === 'verb-ordering-abc')

    expect(pattern).toEqual(expect.objectContaining({
      sourceRef: 'lesson-9/pattern-verb-ordering-abc',
      name: expect.stringContaining('Volgorde werkwoorden'),
    }))
    expect(pattern?.examples).toEqual(expect.arrayContaining(['Saya tidak mau datang']))
  })

  it('includes staged morphology pairs in lesson health without introducing critical findings', async () => {
    const report = await buildCapabilityHealthReport('scripts/data/staging/lesson-9')

    expect(report.criticalCount).toBe(0)
    expect(report.results.map(result => result.canonicalKey)).toEqual(expect.arrayContaining([
      'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recognition:derived_to_root:text:none',
      'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
    ]))
  })
})
