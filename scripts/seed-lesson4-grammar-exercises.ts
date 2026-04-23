#!/usr/bin/env bun
/**
 * seed-lesson4-grammar-exercises.ts
 *
 * Seeds grammar_patterns and approved exercise candidates for lesson 4.
 * - grammar_patterns: upserted unconditionally (on conflict slug)
 * - candidates: only `approved` status seeded; `pending_review` are skipped
 *
 * Usage:
 *   bun scripts/seed-lesson4-grammar-exercises.ts --dry-run
 *   bun scripts/seed-lesson4-grammar-exercises.ts
 *   Requires SUPABASE_SERVICE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { grammarPatterns } from './data/staging/lesson-4/grammar-patterns'
import { candidates } from './data/staging/lesson-4/candidates'

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('CRITICAL: SUPABASE_SERVICE_KEY not set. Add it to .env.local.')
  process.exit(1)
}

const supabase = createClient('https://api.supabase.duin.home', serviceKey)

const dryRun = process.argv.includes('--dry-run')

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Seeding lesson 4 grammar patterns and exercise candidates...\n`)

// 1. Grammar patterns
console.log(`--- grammar_patterns (${grammarPatterns.length} patterns) ---`)

for (const p of grammarPatterns) {
  if (dryRun) {
    console.log(`  would upsert: ${p.slug}  (complexity ${p.complexity_score}, group: ${p.confusion_group})`)
    continue
  }

  const { error } = await supabase
    .schema('indonesian')
    .from('grammar_patterns')
    .upsert(
      {
        slug: p.slug,
        name: p.pattern_name,
        short_explanation: p.description,
        complexity_score: p.complexity_score,
        confusion_group: p.confusion_group ?? null,
      },
      { onConflict: 'slug' },
    )

  if (error) {
    console.error(`  ERROR upserting ${p.slug}:`, error.message)
    process.exit(1)
  }
  console.log(`  upserted: ${p.slug}`)
}

if (!dryRun) {
  console.log(`  grammar_patterns: ${grammarPatterns.length} upserted\n`)
}

// 2. Exercise candidates
const approvedCandidates = candidates.filter(c => c.review_status === 'approved')
const pendingCandidates = candidates.filter(c => c.review_status === 'pending_review')
const rejectedCandidates = candidates.filter(c => c.review_status === 'rejected')

console.log(`\n--- exercise candidates (${candidates.length} total) ---`)
console.log(`  approved:       ${approvedCandidates.length}`)
console.log(`  pending_review: ${pendingCandidates.length}  <-- skipped`)
console.log(`  rejected:       ${rejectedCandidates.length}  <-- skipped`)

const skipped = pendingCandidates.length + rejectedCandidates.length

if (approvedCandidates.length === 0) {
  console.log('\n  No approved candidates to seed.')
} else {
  // Approved candidates would be seeded here. exercise_variants requires
  // learning_item_id + context_id FKs — approved candidates must carry those
  // before this block runs. Not implemented yet.
  console.log(`\n  Would seed ${approvedCandidates.length} approved candidates (not yet implemented).`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n--- Summary ---')
if (dryRun) {
  console.log(`  [DRY RUN] Would upsert ${grammarPatterns.length} grammar patterns`)
  console.log(`  WARNING: ${pendingCandidates.length} candidates in pending_review — skipped`)
  console.log(`  Approved candidates to seed: ${approvedCandidates.length}`)
} else {
  console.log(`  grammar_patterns upserted: ${grammarPatterns.length}`)
  console.log(`  exercise candidates inserted: 0`)
  console.log(`  skipped (pending/rejected): ${skipped}`)
}

console.log('\nDone.')
