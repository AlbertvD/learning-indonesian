import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadFeatureFlags() {
  vi.resetModules()
  return import('@/lib/featureFlags')
}

describe('capability migration feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults the cutover runtime flags to enabled and operational flags to disabled', async () => {
    vi.stubEnv('VITE_CAPABILITY_SESSION_DIAGNOSTICS', '')
    vi.stubEnv('VITE_CAPABILITY_REVIEW_SHADOW', '')
    vi.stubEnv('VITE_CAPABILITY_REVIEW_COMPAT', '')
    vi.stubEnv('VITE_CAPABILITY_STANDARD_SESSION', '')
    vi.stubEnv('VITE_EXPERIENCE_PLAYER_V1', '')
    vi.stubEnv('VITE_LESSON_READER_V2', '')
    vi.stubEnv('VITE_LOCAL_CONTENT_PREVIEW', '')

    const { capabilityMigrationFlags } = await loadFeatureFlags()

    expect(capabilityMigrationFlags).toEqual({
      sessionDiagnostics: false,
      reviewShadow: false,
      reviewCompat: false,
      standardSession: true,
      experiencePlayerV1: true,
      lessonReaderV2: true,
      localContentPreview: false,
    })
  })

  it.each([
    ['', true],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', true],
  ])('parses %s for enabled-by-default cutover flags', async (value, expected) => {
    vi.stubEnv('VITE_CAPABILITY_STANDARD_SESSION', value)

    const { capabilityMigrationFlags } = await loadFeatureFlags()

    expect(capabilityMigrationFlags.standardSession).toBe(expected)
  })

  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', true],
  ])('keeps local preview disabled by default while allowing explicit opt-in: %s', async (value, expected) => {
    vi.stubEnv('VITE_LOCAL_CONTENT_PREVIEW', value)

    const { capabilityMigrationFlags } = await loadFeatureFlags()

    expect(capabilityMigrationFlags.localContentPreview).toBe(expected)
  })

  it('keeps existing exercise flags enabled by default', async () => {
    const { featureFlags } = await loadFeatureFlags()

    expect(featureFlags.cuedRecall).toBe(true)
    expect(featureFlags.dictation).toBe(true)
  })
})
