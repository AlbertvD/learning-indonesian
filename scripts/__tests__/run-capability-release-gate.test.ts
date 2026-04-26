import { describe, expect, it } from 'vitest'
import {
  buildCapabilityReleaseGateCommands,
  parseCapabilityReleaseGateArgs,
} from '../run-capability-release-gate'

describe('capability release gate command', () => {
  it('runs release gate checks in the required order', () => {
    expect(buildCapabilityReleaseGateCommands({ lesson: 1 })).toEqual([
      'npm test -- --run scripts/__tests__/promote-capabilities.test.ts scripts/__tests__/check-capability-release-readiness.test.ts',
      'npm test -- --run scripts/__tests__/approve-staged-capability-artifacts.test.ts',
      'npx tsx scripts/publish-approved-content.ts 1 --dry-run',
      'npx tsx scripts/approve-staged-capability-artifacts.ts --lesson 1 --dry-run',
      'npx tsx scripts/promote-capabilities.ts --lesson 1 --dry-run',
      'npx tsx scripts/check-capability-health.ts --lesson 1 --strict',
      'npx tsx scripts/check-capability-release-readiness.ts --lesson 1',
      'npm run build',
    ])
  })

  it('parses lesson scope safely', () => {
    expect(parseCapabilityReleaseGateArgs(['--lesson', '2'])).toEqual({ lesson: 2 })
    expect(() => parseCapabilityReleaseGateArgs(['--lesson'])).toThrow('--lesson requires a number')
    expect(() => parseCapabilityReleaseGateArgs(['--lesson', '0'])).toThrow('--lesson requires a positive integer')
    expect(() => parseCapabilityReleaseGateArgs(['--bogus'])).toThrow('Unknown argument: --bogus')
  })
})
