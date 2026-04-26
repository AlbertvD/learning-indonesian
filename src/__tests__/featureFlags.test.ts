import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadFeatureFlags() {
  vi.resetModules()
  return import('@/lib/featureFlags')
}

describe('capability migration feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults capability migration flags to disabled', async () => {
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
      standardSession: false,
      experiencePlayerV1: false,
      lessonReaderV2: false,
      localContentPreview: false,
    })
  })

  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', true],
  ])('parses %s for disabled-by-default flags', async (value, expected) => {
    vi.stubEnv('VITE_CAPABILITY_STANDARD_SESSION', value)

    const { capabilityMigrationFlags } = await loadFeatureFlags()

    expect(capabilityMigrationFlags.standardSession).toBe(expected)
  })

  it('keeps existing exercise flags enabled by default', async () => {
    const { featureFlags } = await loadFeatureFlags()

    expect(featureFlags.cuedRecall).toBe(true)
    expect(featureFlags.dictation).toBe(true)
  })
})
