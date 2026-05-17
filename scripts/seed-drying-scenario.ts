#!/usr/bin/env bun
/**
 * seed-drying-scenario.ts
 *
 * Bakes the queue-drying scenario for a target user so the alert on the
 * /session?mode=standard page can be smoke-tested without grinding through
 * lesson reviews in the UI.
 *
 * What it sets up:
 *   - `learner_lesson_activation` for the target lesson (default: order_index=1).
 *   - `learner_capability_state` rows marking every capability in that lesson
 *     as `active` with review_count ≥ 1, so the planner has no eligible new
 *     introductions for that lesson.
 *   - Asserts the next lesson (target + 1) exists and is NOT activated. If
 *     it is activated, the script aborts — the warning would not fire and
 *     you should either pick a different target lesson or unset the next
 *     activation manually.
 *
 * Usage:
 *   bun scripts/seed-drying-scenario.ts --user-id <uuid> [--target-lesson <n>] [--clear]
 *   bun scripts/seed-drying-scenario.ts --email <addr> [--target-lesson <n>] [--clear]
 *
 * Flags:
 *   --user-id <uuid>     The auth.users.id to seed for. (--user-id or --email required.)
 *   --email <addr>       The auth.users.email to look up the id by.
 *   --target-lesson <n>  The lesson order_index to treat as "current". Default: 1.
 *   --clear              Wipe the user's learner_lesson_activation rows first
 *                        (does NOT delete learner_capability_state rows —
 *                        those carry a FK from the capability_review_events
 *                        audit log per ADR 0004 and shouldn't be erased).
 *                        Existing state rows are upserted in place.
 *
 * The script always deletes the *next* lesson's activation row (if any) —
 * drying cannot fire while it's set, regardless of other state.
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local.
 * Uses the REST API + service-role key (bypasses RLS) — works from any
 * machine that can reach api.supabase.duin.home on 443.
 */

import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function loadEnv() {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const USER_ID = (() => {
  const i = process.argv.indexOf('--user-id')
  return i > -1 ? process.argv[i + 1] : null
})()
const EMAIL = (() => {
  const i = process.argv.indexOf('--email')
  return i > -1 ? process.argv[i + 1] : null
})()
const TARGET_LESSON = (() => {
  const i = process.argv.indexOf('--target-lesson')
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 1
})()
const CLEAR = process.argv.includes('--clear')

if (!USER_ID && !EMAIL) {
  console.error('Error: --user-id <uuid> or --email <addr> is required')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const db = supabase.schema('indonesian')

async function resolveUserId(): Promise<string> {
  if (USER_ID) return USER_ID
  // Look up by email via the auth admin API (service role required).
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`)
  const match = data.users.find(u => u.email?.toLowerCase() === EMAIL!.toLowerCase())
  if (!match) throw new Error(`No user found with email=${EMAIL}`)
  return match.id
}

async function seed() {
  const userId = await resolveUserId()
  console.log(`→ Seeding drying scenario for user ${userId} (target lesson order_index=${TARGET_LESSON})`)

  const { data: lessons, error: lessonsErr } = await db
    .from('lessons')
    .select('id, title, order_index')
    .in('order_index', [TARGET_LESSON, TARGET_LESSON + 1])
  if (lessonsErr) throw new Error(`lessons read failed: ${lessonsErr.message}`)
  const targetLesson = lessons?.find(l => l.order_index === TARGET_LESSON)
  const nextLesson = lessons?.find(l => l.order_index === TARGET_LESSON + 1)
  if (!targetLesson) throw new Error(`No lesson with order_index=${TARGET_LESSON}`)
  if (!nextLesson) throw new Error(
    `No lesson with order_index=${TARGET_LESSON + 1}. Pick a target with a successor — drying needs a "next lesson" to point at.`,
  )
  console.log(`  ✓ Target lesson: "${targetLesson.title}" (id=${targetLesson.id})`)
  console.log(`  ✓ Next lesson exists: "${nextLesson.title}" (order_index=${nextLesson.order_index})`)

  if (CLEAR) {
    console.log('  → --clear: wiping existing activations for user (state rows preserved — FK from capability_review_events per ADR 0004)')
    const { error: delAct } = await db.from('learner_lesson_activation').delete().eq('user_id', userId)
    if (delAct) throw new Error(`activation delete failed: ${delAct.message}`)
  } else {
    // Drying cannot fire while the *next* lesson is activated. Always drop
    // that specific row so the smoke test is deterministic.
    const { error: delNext } = await db
      .from('learner_lesson_activation')
      .delete()
      .eq('user_id', userId)
      .eq('lesson_id', nextLesson.id)
    if (delNext) throw new Error(`next-activation delete failed: ${delNext.message}`)
    console.log(`  ✓ Removed any existing activation for the next lesson`)
  }

  const { error: actErr } = await db
    .from('learner_lesson_activation')
    .upsert({ user_id: userId, lesson_id: targetLesson.id }, { onConflict: 'user_id,lesson_id' })
  if (actErr) throw new Error(`activation insert failed: ${actErr.message}`)
  console.log(`  ✓ learner_lesson_activation row for target lesson`)

  const { data: capabilities, error: capErr } = await db
    .from('learning_capabilities')
    .select('id, canonical_key')
    .eq('lesson_id', targetLesson.id)
    .eq('readiness_status', 'ready')
    .eq('publication_status', 'published')
  if (capErr) throw new Error(`capabilities read failed: ${capErr.message}`)
  if (!capabilities || capabilities.length === 0) {
    throw new Error(
      `Target lesson has no published+ready capabilities to seed. Either pick a different lesson or check the catalog.`,
    )
  }

  const lastReviewedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const nextDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const rows = capabilities.map(cap => ({
    user_id: userId,
    capability_id: cap.id,
    canonical_key_snapshot: cap.canonical_key,
    activation_state: 'active',
    review_count: 1,
    lapse_count: 0,
    consecutive_failure_count: 0,
    state_version: 1,
    last_reviewed_at: lastReviewedAt,
    next_due_at: nextDueAt,
  }))

  const { error: stateErr } = await db
    .from('learner_capability_state')
    .upsert(rows, { onConflict: 'user_id,capability_id' })
  if (stateErr) throw new Error(`state upsert failed: ${stateErr.message}`)
  console.log(`  ✓ learner_capability_state: ${rows.length} rows upserted (active) for lesson-${TARGET_LESSON} capabilities`)

  // Post-seed verification — count rows that would actually count as due
  // right now. If dueCount > preferredSize (default 15), drying is
  // suppressed regardless of the lesson state.
  const { data: dueRows, error: dueErr } = await db
    .from('learner_capability_state')
    .select('id')
    .eq('user_id', userId)
    .eq('activation_state', 'active')
    .lte('next_due_at', new Date().toISOString())
  if (dueErr) throw new Error(`due count check failed: ${dueErr.message}`)
  const dueCount = dueRows?.length ?? 0
  console.log(`  ℹ Current due capabilities for this user: ${dueCount}`)
  if (dueCount > 15) {
    console.log(`  ⚠ dueCount (${dueCount}) > default preferredSessionSize (15) — drying will be SUPPRESSED by backlog. Drain reviews or seed against a fresher user.`)
  }

  console.log(`\n✅ Drying scenario seeded. Log in as user ${userId} and open /session?mode=standard — the blue alert should appear above the player.`)
}

seed().catch(err => {
  console.error(`\n❌ Seed failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
