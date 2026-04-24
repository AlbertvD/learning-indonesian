#!/usr/bin/env bun
/**
 * dev-stage-force.ts
 *
 * Developer helper for runtime verification — forces a specific learner_item_state
 * stage and/or a learner_skill_state.next_due_at for a single (user, item) pair.
 *
 * Used by the dialogue-pipeline-completion plan's Phase 1 Task 1.6 runtime
 * walkthrough (force a dialogue_chunk immediately due at retrieving to confirm
 * the cloze path renders end-to-end).
 *
 * Service-role UPDATE — bypasses RLS. NEVER use against production without
 * explicit intent.
 *
 * Usage:
 *   bun scripts/dev-stage-force.ts --user <uuid> --item <uuid> --due [skill]
 *   bun scripts/dev-stage-force.ts --user <uuid> --item <uuid> --stage productive
 *   bun scripts/dev-stage-force.ts --user <uuid> --item <uuid> --due recognition --stage productive
 *
 * Flags:
 *   --user     user_id UUID (required)
 *   --item     learning_item_id UUID (required)
 *   --due      force the skill's next_due_at to 1 day ago. Optional skill_type
 *              (recognition / meaning_recall / form_recall). Default: recognition.
 *   --stage    force learner_item_state.stage to one of:
 *              new / anchoring / retrieving / productive / maintenance
 *   --dry-run  preview only
 *
 * Exit codes:
 *   0 — success
 *   1 — error (bad args, no row found, DB failure)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const VALID_STAGES = new Set(['new', 'anchoring', 'retrieving', 'productive', 'maintenance'])
const VALID_SKILLS = new Set(['recognition', 'meaning_recall', 'form_recall'])

function createSupabaseClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL ?? 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    console.error('Error: SUPABASE_SERVICE_KEY not set in .env.local')
    process.exit(1)
  }
  return createClient(url, serviceKey, {
    db: { schema: 'indonesian' },
    auth: { persistSession: false },
  })
}

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  if (idx < 0) return undefined
  const next = args[idx + 1]
  // Treat "--flag" at end of args as present-with-no-value
  if (!next || next.startsWith('--')) return ''
  return next
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const userId = flag(args, 'user')
  const itemId = flag(args, 'item')
  const stageArg = flag(args, 'stage')
  const dueArg = flag(args, 'due')

  if (!userId || !itemId) {
    console.error('Usage: bun scripts/dev-stage-force.ts --user <uuid> --item <uuid> [--due [skill]] [--stage <stage>] [--dry-run]')
    process.exit(1)
  }
  if (!dueArg && stageArg === undefined) {
    console.error('Specify at least one of --due or --stage.')
    process.exit(1)
  }

  const skillType = dueArg !== undefined ? (dueArg || 'recognition') : null
  if (skillType && !VALID_SKILLS.has(skillType)) {
    console.error(`--due skill "${skillType}" invalid. Allowed: ${[...VALID_SKILLS].join(', ')}`)
    process.exit(1)
  }
  if (stageArg && !VALID_STAGES.has(stageArg)) {
    console.error(`--stage "${stageArg}" invalid. Allowed: ${[...VALID_STAGES].join(', ')}`)
    process.exit(1)
  }

  const supabase = createSupabaseClient()

  // Preview the affected item for sanity.
  const { data: item, error: itemErr } = await supabase
    .from('learning_items')
    .select('id, base_text, item_type, is_active')
    .eq('id', itemId)
    .maybeSingle()
  if (itemErr) { console.error('item lookup failed:', itemErr.message); process.exit(1) }
  if (!item) { console.error(`no learning_item with id=${itemId}`); process.exit(1) }
  const preview = item.base_text.length > 70 ? `${item.base_text.slice(0, 70)}…` : item.base_text
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Target: ${item.item_type} "${preview}" (is_active=${item.is_active})`)
  if (!item.is_active) {
    console.warn('  ⚠️ item is inactive — filterEligible will exclude it even after forcing due/stage. Reactivate first.')
  }

  // --due: push a skill row's next_due_at to 1 day ago.
  if (skillType) {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    console.log(`  ${dryRun ? 'Would update' : 'Updating'} learner_skill_state (skill=${skillType}) → next_due_at=${pastDue}`)
    if (!dryRun) {
      const { data, error } = await supabase
        .from('learner_skill_state')
        .update({ next_due_at: pastDue })
        .eq('user_id', userId)
        .eq('learning_item_id', itemId)
        .eq('skill_type', skillType)
        .select('id')
      if (error) { console.error('skill UPDATE failed:', error.message); process.exit(1) }
      if (!data || data.length === 0) {
        console.error(`  ✗ no learner_skill_state row matched (user=${userId}, item=${itemId}, skill=${skillType}). Was the skill ever introduced?`)
        process.exit(1)
      }
      console.log(`  ✓ Forced ${data.length} skill row(s) due.`)
    }
  }

  // --stage: update learner_item_state.stage.
  if (stageArg) {
    console.log(`  ${dryRun ? 'Would update' : 'Updating'} learner_item_state → stage=${stageArg}`)
    if (!dryRun) {
      const { data, error } = await supabase
        .from('learner_item_state')
        .update({ stage: stageArg })
        .eq('user_id', userId)
        .eq('learning_item_id', itemId)
        .select('id')
      if (error) { console.error('stage UPDATE failed:', error.message); process.exit(1) }
      if (!data || data.length === 0) {
        console.error(`  ✗ no learner_item_state row matched (user=${userId}, item=${itemId}). Item hasn't been introduced in a session yet.`)
        process.exit(1)
      }
      console.log(`  ✓ Forced stage → ${stageArg} on ${data.length} row(s).`)
    }
  }

  console.log(dryRun ? '\n[DRY RUN] No DB writes.' : '\nDone. Reload the session page to see the effect.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
