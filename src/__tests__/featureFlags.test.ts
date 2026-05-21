import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadFeatureFlags() {
  vi.resetModules()
  return import('@/lib/featureFlags')
}

describe('capability migration feature flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults localContentPreview to disabled when unset', async () => {
    vi.stubEnv('VITE_LOCAL_CONTENT_PREVIEW', '')

    const { capabilityMigrationFlags } = await loadFeatureFlags()

    expect(capabilityMigrationFlags).toEqual({
      localContentPreview: false,
    })
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
