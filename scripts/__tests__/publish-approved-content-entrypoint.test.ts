import { describe, expect, it, vi } from 'vitest'

describe('publish-approved-content module entrypoint', () => {
  it('can be imported by tests without running the CLI', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called during import')
    }) as never)

    // Post Phase 2 fold: publishLegacyStageB / publishCapabilityPipelineOutput
    // are gone (capability-stage-legacy.ts deleted). The module now re-exports
    // only buildLintStagingCommand for test consumers.
    const module = await import('../publish-approved-content')

    expect(module.buildLintStagingCommand).toEqual(expect.any(Function))
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('builds a Node/tsx lint command instead of depending on Bun', async () => {
    const { buildLintStagingCommand } = await import('../publish-approved-content')

    const command = buildLintStagingCommand(1)

    expect(command.command).toBe(process.execPath)
    expect(command.args).toContain('scripts/lint-staging.ts')
    expect(command.args).toEqual(expect.arrayContaining(['--lesson', '1', '--severity', 'critical']))
  })
})
