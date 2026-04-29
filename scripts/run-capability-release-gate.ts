import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export interface CapabilityReleaseGateArgs {
  lesson: number
}

export function parseCapabilityReleaseGateArgs(args: string[]): CapabilityReleaseGateArgs {
  const knownArgs = new Set(['--lesson'])
  for (const arg of args) {
    if (arg.startsWith('--') && !knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const lessonIndex = args.indexOf('--lesson')
  if (lessonIndex < 0) throw new Error('--lesson is required')
  const rawLesson = args[lessonIndex + 1]
  if (!rawLesson || rawLesson.startsWith('--')) throw new Error('--lesson requires a number')
  const lesson = Number(rawLesson)
  if (!Number.isInteger(lesson) || lesson <= 0) throw new Error('--lesson requires a positive integer')

  return { lesson }
}

export function buildCapabilityReleaseGateCommands(input: CapabilityReleaseGateArgs): string[] {
  return [
    'npm test -- --run scripts/__tests__/promote-capabilities.test.ts scripts/__tests__/check-capability-release-readiness.test.ts',
    'npm test -- --run scripts/__tests__/approve-staged-capability-artifacts.test.ts',
    `npx tsx scripts/publish-approved-content.ts ${input.lesson} --dry-run`,
    `npx tsx scripts/approve-staged-capability-artifacts.ts --lesson ${input.lesson} --dry-run`,
    `npx tsx scripts/promote-capabilities.ts --lesson ${input.lesson} --dry-run`,
    `npx tsx scripts/check-capability-health.ts --lesson ${input.lesson} --strict`,
    `npx tsx scripts/check-capability-release-readiness.ts --lesson ${input.lesson}`,
    'npm run build',
  ]
}

export function runCapabilityReleaseGate(input: CapabilityReleaseGateArgs): number {
  for (const command of buildCapabilityReleaseGateCommands(input)) {
    console.log(`\n$ ${command}`)
    const result = spawnSync(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      console.error(`\nCapability release gate failed at command: ${command}`)
      return result.status ?? 1
    }
  }
  console.log('\nCapability release gate passed.')
  return 0
}

function isMainModule(): boolean {
  return import.meta.url === pathToFileURL(process.argv[1] ?? '').href
}

if (isMainModule()) {
  try {
    process.exit(runCapabilityReleaseGate(parseCapabilityReleaseGateArgs(process.argv.slice(2))))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
