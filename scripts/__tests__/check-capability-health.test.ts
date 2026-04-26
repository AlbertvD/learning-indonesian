import { describe, expect, it } from 'vitest'
import { buildCapabilityHealthReport, getCapabilityHealthExitCode, loadStagedContentSnapshot, parseCapabilityHealthArgs } from '../check-capability-health'

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
