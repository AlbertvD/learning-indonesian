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
 *
 * Flags:
 *   --user-id <uuid>     Required. The auth.users.id to seed for.
 *   --target-lesson <n>  The lesson order_index to treat as "current".
 *                        Default: 1.
 *   --clear              Wipe the user's learner_capability_state +
 *                        learner_lesson_activation rows first. Use to
 *                        re-baseline a polluted test user.
 *
 * Requires POSTGRES_PASSWORD in .env.local.
 */

import fs from 'fs'
import postgres from 'postgres'

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
const TARGET_LESSON = (() => {
  const i = process.argv.indexOf('--target-lesson')
  return i > -1 ? parseInt(process.argv[i + 1], 10) : 1
})()
const CLEAR = process.argv.includes('--clear')

if (!USER_ID) {
  console.error('Error: --user-id <uuid> is required')
  process.exit(1)
}

const postgresPassword = process.env.POSTGRES_PASSWORD
if (!postgresPassword) {
  console.error('Error: POSTGRES_PASSWORD must be set in .env.local')
  process.exit(1)
}

const sql = postgres({
  host: 'api.supabase.duin.home',
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: postgresPassword,
  ssl: 'require',
})

async function seed() {
  console.log(`→ Seeding drying scenario for user ${USER_ID} (target lesson order_index=${TARGET_LESSON})`)

  const userRow = await sql`select id from auth.users where id = ${USER_ID}::uuid limit 1`
  if (userRow.length === 0) {
    throw new Error(`No auth.users row with id=${USER_ID}`)
  }

  const targetLesson = await sql`
    select id, title, order_index from indonesian.lessons where order_index = ${TARGET_LESSON} limit 1
  `
  if (targetLesson.length === 0) {
    throw new Error(`No lesson with order_index=${TARGET_LESSON}`)
  }
  const targetLessonId = targetLesson[0].id
  console.log(`  ✓ Target lesson: "${targetLesson[0].title}" (id=${targetLessonId})`)

  const nextLesson = await sql`
    select id, title, order_index from indonesian.lessons where order_index = ${TARGET_LESSON + 1} limit 1
  `
  if (nextLesson.length === 0) {
    throw new Error(
      `No lesson with order_index=${TARGET_LESSON + 1}. Pick a target with a successor — drying needs a "next lesson" to point at.`,
    )
  }
  console.log(`  ✓ Next lesson exists: "${nextLesson[0].title}" (order_index=${nextLesson[0].order_index})`)

  const nextAlreadyActive = await sql`
    select 1 from indonesian.learner_lesson_activation
    where user_id = ${USER_ID}::uuid and lesson_id = ${nextLesson[0].id}::uuid
  `
  if (nextAlreadyActive.length > 0 && !CLEAR) {
    throw new Error(
      `User already has the NEXT lesson activated. The drying alert won't fire. Re-run with --clear, or unset the next-lesson activation manually.`,
    )
  }

  if (CLEAR) {
    console.log('  → --clear: wiping existing activations + capability state for user')
    await sql`delete from indonesian.learner_lesson_activation where user_id = ${USER_ID}::uuid`
    await sql`delete from indonesian.learner_capability_state where user_id = ${USER_ID}::uuid`
  }

  await sql`
    insert into indonesian.learner_lesson_activation (user_id, lesson_id)
    values (${USER_ID}::uuid, ${targetLessonId}::uuid)
    on conflict (user_id, lesson_id) do nothing
  `
  console.log(`  ✓ learner_lesson_activation row for target lesson`)

  const capabilities = await sql`
    select id, canonical_key
    from indonesian.learning_capabilities
    where lesson_id = ${targetLessonId}::uuid
      and readiness_status = 'ready'
      and publication_status = 'published'
  `
  if (capabilities.length === 0) {
    throw new Error(
      `Target lesson has no published+ready capabilities to seed. Either pick a different lesson or check the catalog.`,
    )
  }

  let inserted = 0
  let updated = 0
  for (const cap of capabilities) {
    const result = await sql`
      insert into indonesian.learner_capability_state (
        user_id, capability_id, canonical_key_snapshot, activation_state,
        review_count, lapse_count, consecutive_failure_count, state_version,
        last_reviewed_at, next_due_at
      )
      values (
        ${USER_ID}::uuid, ${cap.id}::uuid, ${cap.canonical_key}, 'active',
        1, 0, 0, 1,
        now() - interval '1 hour', now() + interval '30 days'
      )
      on conflict (user_id, capability_id) do update set
        activation_state = 'active',
        review_count = greatest(excluded.review_count, indonesian.learner_capability_state.review_count),
        next_due_at = now() + interval '30 days',
        state_version = indonesian.learner_capability_state.state_version + 1
      returning xmax = 0 as inserted
    `
    if (result[0]?.inserted) inserted += 1
    else updated += 1
  }
  console.log(`  ✓ learner_capability_state: ${inserted} inserted, ${updated} updated (across ${capabilities.length} lesson-${TARGET_LESSON} capabilities)`)

  console.log(`\n✅ Drying scenario seeded. Log in as user ${USER_ID} and open /session?mode=standard — the blue alert should appear above the player.`)
  console.log(`   To clear: re-run with --clear and a different --target-lesson, or wipe the user's state manually.`)
}

seed()
  .catch(err => {
    console.error(`\n❌ Seed failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
  .finally(() => sql.end())
