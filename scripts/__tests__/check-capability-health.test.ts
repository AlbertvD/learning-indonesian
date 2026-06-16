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

  it('keeps a ready form_recall capability eligible for runtime health (resolves via type_form_ex)', () => {
    const capabilityKey = 'cap:v1:vocabulary_src:learning_items/makan:produce_form_from_meaning_cap:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'produce_form_from_meaning_cap',
        skillType: 'produce_mode',
        readinessStatus: 'ready',
        publicationStatus: 'published',
      }],
    })

    expect(report.critical).toEqual([])
  })

  it('accepts ready Dutch-to-Indonesian choice capabilities with a cued recall render path', () => {
    const capabilityKey = 'cap:v1:vocabulary_src:learning_items/makan:recognise_form_from_meaning_cap:l1_to_id:text:nl'
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: capabilityKey,
        sourceRef: 'learning_items/makan',
        capabilityType: 'recognise_form_from_meaning_cap',
        skillType: 'recall_mode',
        readinessStatus: 'ready',
        publicationStatus: 'published',
      }],
    })

    expect(report.critical).toEqual([])
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
        canonicalKey: 'cap:v1:vocabulary_src:learning_items/minum:recognise_meaning_from_text_cap:id_to_l1:text:nl',
        sourceRef: 'learning_items/minum',
        capabilityType: 'recognise_meaning_from_text_cap',
        skillType: 'recognise_mode',
        readinessStatus: 'ready',
        publicationStatus: 'published',
      }],
    })

    expect(report.warnings).not.toContainEqual(expect.objectContaining({
      rule: 'ready_capability_unreachable_source_ref',
    }))
  })

  it('reports draft/unknown capabilities as warnings instead of blockers', () => {
    const report = checkCapabilityHealthSnapshot({
      capabilities: [{
        canonicalKey: 'cap:v1:vocabulary_src:learning_items/makan:recall_meaning_from_text_cap:id_to_l1:text:nl',
        sourceRef: 'learning_items/makan',
        capabilityType: 'recall_meaning_from_text_cap',
        skillType: 'recall_mode',
        readinessStatus: 'unknown',
        publicationStatus: 'draft',
      }],
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

  it('marks staged morphology pairs as ready via type_form_ex when both artifacts are approved (2026-05-21 affixed-form-pair widening)', async () => {
    // Post the 2026-05-21 affixed-form-pair widening: type_form_ex accepts
    // word_form_pair_src source kind with requiredArtifacts
    // {root_derived_pair, allomorph_rule}. Both are emitted by the existing
    // publish pipeline at scripts/lib/content-pipeline-output.ts:430-441 so
    // L9's 4 morphology caps register as ready with type_form_ex as the
    // only allowed exercise (choose_form_ex stays item-only per D4).
    const report = await buildCapabilityHealthReport('scripts/data/staging/lesson-9')

    expect(report.results.map(result => result.canonicalKey)).toEqual(expect.arrayContaining([
      'cap:v1:word_form_pair_src:lesson-9/morphology/meN-baca-membaca:recognise_word_form_link_cap:derived_to_root:text:none',
      'cap:v1:word_form_pair_src:lesson-9/morphology/meN-baca-membaca:produce_derived_form_cap:root_to_derived:text:none',
    ]))
    const morphologyResults = report.results.filter(r => r.canonicalKey.startsWith('cap:v1:word_form_pair_src:'))
    expect(morphologyResults.length).toBeGreaterThan(0)
    for (const result of morphologyResults) {
      expect(result.readiness.status).toBe('ready')
      if (result.readiness.status === 'ready') {
        expect(result.readiness.allowedExercises).toEqual(['type_form_ex'])
      }
    }
  })
})
