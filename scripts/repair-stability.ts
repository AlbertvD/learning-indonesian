#!/usr/bin/env bun
/**
 * repair-stability.ts
 *
 * Repairs learner_skill_state.stability values that were damaged by the
 * grammar adjustment bug (applyGrammarAdjustment applied 20% reduction to ALL
 * correct answers, not just confusable items).
 *
 * Strategy: replay each skill's review history through the corrected FSRS
 * (no grammar adjustment) and update stability + next_due_at accordingly.
 *
 * Safe to re-run. Only updates skills where replayed stability differs
 * significantly from current value (> 5% difference).
 *
 * Usage:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 SUPABASE_SERVICE_KEY=<key> bun scripts/repair-stability.ts
 *   Add --dry-run to preview without writing.
 */

import { createClient } from '@supabase/supabase-js'
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const dryRun = process.argv.includes('--dry-run')

if (!serviceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable not set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

// Same FSRS params as the app
const params = {
  ...generatorParameters(),
  request_retention: 0.85,
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.52, 0.62, 0.4, 1.26, 0.29, 2.52] as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number],
}
const scheduler = fsrs(params)

function ratingFromCorrect(wasCorrect: boolean): number {
  return wasCorrect ? Rating.Good : Rating.Again
}

async function main() {
  console.log(`\nRepair stability — ${dryRun ? 'DRY RUN' : 'LIVE'}\n`)

  // Fetch all current skill states
  const { data: skillStates, error: ssErr } = await supabase
    .schema('indonesian')
    .from('learner_skill_state')
    .select('id, user_id, learning_item_id, skill_type, stability, difficulty, success_count, last_reviewed_at, next_due_at')

  if (ssErr || !skillStates) {
    console.error('Failed to fetch skill states:', ssErr?.message)
    process.exit(1)
  }

  console.log(`Found ${skillStates.length} skill states to check\n`)

  let repaired = 0
  let skipped = 0
  let unchanged = 0

  for (const skill of skillStates) {
    // Fetch all review events for this skill in chronological order
    const { data: events, error: evErr } = await supabase
      .schema('indonesian')
      .from('review_events')
      .select('created_at, was_correct, skill_type')
      .eq('user_id', skill.user_id)
      .eq('learning_item_id', skill.learning_item_id)
      .eq('skill_type', skill.skill_type)
      .order('created_at', { ascending: true })

    if (evErr || !events || events.length === 0) {
      skipped++
      continue
    }

    // Replay through FSRS without grammar adjustment
    let card: Card = createEmptyCard(new Date(events[0].created_at))

    for (const ev of events) {
      const reviewDate = new Date(ev.created_at)
      const rating = ratingFromCorrect(ev.was_correct)
      const result = scheduler.next(card, reviewDate, rating)
      card = result.card
    }

    const replayedStability = card.stability
    const currentStability = skill.stability

    // Check if there's a meaningful difference (> 5%)
    const diff = Math.abs(replayedStability - currentStability) / Math.max(replayedStability, currentStability)
    if (diff < 0.05) {
      unchanged++
      continue
    }

    // Compute new next_due_at based on replayed stability
    // Use the last scheduled due date from the replayed card
    const newNextDueAt = card.due.toISOString()

    console.log(
      `  ${skill.skill_type.padEnd(12)} stability: ${currentStability.toFixed(3)} → ${replayedStability.toFixed(3)}` +
      `  (+${((replayedStability / currentStability - 1) * 100).toFixed(0)}%)` +
      `  [${events.length} reviews]`
    )

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .schema('indonesian')
        .from('learner_skill_state')
        .update({
          stability: replayedStability,
          difficulty: card.difficulty,
          next_due_at: newNextDueAt,
        })
        .eq('id', skill.id)

      if (updateErr) {
        console.error(`  ❌ Failed to update ${skill.id}:`, updateErr.message)
      } else {
        repaired++
      }
    } else {
      repaired++
    }
  }

  console.log(`\n✓ Done:`)
  console.log(`  ${repaired} skills ${dryRun ? 'would be repaired' : 'repaired'}`)
  console.log(`  ${unchanged} skills already correct (< 5% diff)`)
  console.log(`  ${skipped} skills skipped (no review history)`)
}

main()
