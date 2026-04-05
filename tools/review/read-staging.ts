#!/usr/bin/env tsx
/**
 * Helper: dynamically imports a staging file and prints JSON to stdout.
 * Usage: tsx read-staging.ts <lesson> <type>
 *   type: candidates | grammarPatterns
 */

const lesson = process.argv[2]
const type = process.argv[3] ?? 'candidates'

if (!lesson) {
  console.error('Usage: tsx read-staging.ts <lesson> [candidates|grammarPatterns]')
  process.exit(1)
}

const base = new URL(`../../scripts/data/staging/lesson-${lesson}/`, import.meta.url)

try {
  if (type === 'grammarPatterns') {
    const mod = await import(new URL('grammar-patterns.ts', base).pathname)
    const data = mod.grammarPatterns ?? mod.default ?? []
    process.stdout.write(JSON.stringify(data))
  } else {
    const mod = await import(new URL('candidates.ts', base).pathname)
    const data = mod.candidates ?? mod.default ?? []
    process.stdout.write(JSON.stringify(data))
  }
} catch {
  process.stdout.write(JSON.stringify([]))
}
