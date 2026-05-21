import { describe, expect, it } from 'vitest'
import {
  buildCapabilityHealthReport,
  checkCapabilityHealthSnapshot,
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
    // Post-PR #65: form_recall routes to cued_recall + typed_recall in the
    // RENDER_CONTRACTS table. typed_recall's contract requires
    // ['base_text', 'meaning:l1', 'accepted_answers:id']. The cap also
    // declares its own requiredArtifacts which validateCapability unions
    // with the contract's; this fixture provides every artifact in that
    // union so the cap remains ready.
    const capabilityKey = 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'form_recall',
        skillType: 'form_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['meaning:l1', 'base_text', 'accepted_answers:id'],
      }],
      artifacts: [{
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'accepted_answers:id',
        qualityStatus: 'approved',
        artifactJson: { values: ['makan'] },
      }, {
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'meaning:l1',
        qualityStatus: 'approved',
        artifactJson: { value: 'eten' },
      }, {
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'base_text',
        qualityStatus: 'approved',
        artifactJson: { value: 'makan' },
      }],
    })

    expect(report.critical).toEqual([])
  })

  it('accepts ready Dutch-to-Indonesian choice capabilities with a cued recall render path', () => {
    const capabilityKey = 'cap:v1:item:learning_items/makan:l1_to_id_choice:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'l1_to_id_choice',
        skillType: 'meaning_recall',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['meaning:l1', 'base_text'],
      }],
      artifacts: [{
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'meaning:l1',
        qualityStatus: 'approved',
        artifactJson: { value: 'eten' },
      }, {
        capabilityKey,
        sourceRef: 'learning_items/makan',
        artifactKind: 'base_text',
        qualityStatus: 'approved',
        artifactJson: { value: 'makan' },
      }],
    })

    expect(report.critical).toEqual([])
  })

  it('fails approved artifacts with invalid artifact-kind payload shapes', () => {
    const capabilityKey = 'cap:v1:item:learning_items/makan:form_recall:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
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

  it('does NOT emit ready_capability_unreachable_source_ref (retired in Phase 1 of retiring lesson_page_blocks, 2026-05-20)', () => {
    // Pre-Phase-1 the check fired when a cap's source_ref was not in
    // knownSourceRefs (derived from page_blocks + content_units). With
    // page_blocks removed and content_units no longer fetched in DB mode,
    // knownSourceRefs no longer exists and the warning is retired (it had no
    // orthogonal source to validate against — knownSourceRefs was derived
    // from the same caps it was supposed to check). ADR 0006 stamps lesson_id
    // on every lesson-derived cap, replacing the validation purpose.
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: 'cap:v1:item:learning_items/minum:text_recognition:id_to_l1:text:nl',
        sourceRef: 'learning_items/minum',
        capabilityType: 'text_recognition',
        skillType: 'recognition',
        readinessStatus: 'ready',
        publicationStatus: 'published',
        requiredArtifacts: ['base_text'],
      }],
      artifacts: [{
        capabilityKey: 'cap:v1:item:learning_items/minum:text_recognition:id_to_l1:text:nl',
        sourceRef: 'learning_items/minum',
        artifactKind: 'base_text',
        qualityStatus: 'approved',
        artifactJson: { value: 'minum' },
      }],
    })

    expect(report.warnings).not.toContainEqual(expect.objectContaining({
      rule: 'ready_capability_unreachable_source_ref',
    }))
  })

  it('reports draft/unknown capabilities as warnings instead of blockers', () => {
    const report = checkCapabilityHealthSnapshot({
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

  it('derives lesson-aware grammar pattern refs and examples from staged descriptions', async () => {
    const { snapshot } = await loadStagedContentSnapshot('scripts/data/staging/lesson-9')
    const pattern = snapshot.grammarPatterns.find(item => item.id === 'verb-ordering-abc')

    expect(pattern).toEqual(expect.objectContaining({
      sourceRef: 'lesson-9/pattern-verb-ordering-abc',
      name: expect.stringContaining('Volgorde werkwoorden'),
    }))
    expect(pattern?.examples).toEqual(expect.arrayContaining(['Saya tidak mau datang']))
  })

  it('blocks staged morphology pairs at validation pending the affixed_form_pair renderer (PR #65 source-kind decision)', async () => {
    // Per PR #65 plan §"Source kind decision": every contract's
    // supportedSourceKinds is currently ['item']. Morphology caps have
    // sourceKind='affixed_form_pair' so they're correctly marked `blocked`
    // at validateCapability with reason 'no_compatible_exercise_for_capability_type'
    // instead of passing as `ready` and silently dropping at runtime. The
    // future capabilityContentService fold widens supportedSourceKinds and
    // this assertion flips back to criticalCount === 0.
    const report = await buildCapabilityHealthReport('scripts/data/staging/lesson-9')

    expect(report.results.map(result => result.canonicalKey)).toEqual(expect.arrayContaining([
      'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recognition:derived_to_root:text:none',
      'cap:v1:affixed_form_pair:lesson-9/morphology/meN-baca-membaca:root_derived_recall:root_to_derived:text:none',
    ]))
    // Morphology caps now register as blocked-critical until the renderer ships.
    const morphologyResults = report.results.filter(r => r.canonicalKey.startsWith('cap:v1:affixed_form_pair:'))
    expect(morphologyResults.length).toBeGreaterThan(0)
    for (const result of morphologyResults) {
      expect(result.readiness.status).toBe('blocked')
    }
  })
})
