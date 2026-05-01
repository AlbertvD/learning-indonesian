// One-shot: re-upserts lesson_page_blocks rows from the regenerated
// scripts/data/staging/lesson-N/lesson-page-blocks.ts files for all 9 lessons.
//
// Why: the bridge fix in scripts/lib/content-pipeline-output.ts adds per-item
// and per-pattern source_refs to section blocks so check-capability-health's
// filterScopedContentUnits keeps the per-item content_units in
// `knownSourceRefs`. Without this, ready item-scoped capabilities trip the
// `ready_capability_unknown_source_progress_ref` rule.
//
// Re-running publish-approved-content would demote all 2,183 promoted
// capabilities back to unknown/draft because the publish path hardcodes
// readiness_status='unknown'. This script only touches lesson_page_blocks.
//
// Run: NODE_TLS_REJECT_UNAUTHORIZED=0 \
//   npx tsx scripts/sync-lesson-page-blocks-only.ts

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

interface LessonPageBlock {
  block_key: string
  source_ref: string
  source_refs?: string[]
  content_unit_slugs?: string[]
  block_kind: string
  display_order: number
  payload_json?: Record<string, unknown>
  source_progress_event?: string | null
  capability_key_refs?: string[]
}

async function loadBlocks(lessonNumber: number): Promise<LessonPageBlock[]> {
  const filePath = path.join(process.cwd(), 'scripts/data/staging', `lesson-${lessonNumber}`, 'lesson-page-blocks.ts')
  if (!fs.existsSync(filePath)) return []
  const url = pathToFileURL(path.resolve(filePath)).href
  const mod = await import(url) as { lessonPageBlocks?: LessonPageBlock[] }
  return mod.lessonPageBlocks ?? []
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || 'https://api.supabase.duin.home'
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_KEY is required')
  const supabase = createClient(url, serviceKey)

  let totalUpserts = 0
  for (let lessonNumber = 1; lessonNumber <= 9; lessonNumber++) {
    const blocks = await loadBlocks(lessonNumber)
    if (blocks.length === 0) continue
    let lessonUpserts = 0
    for (const block of blocks) {
      const { error } = await supabase
        .schema('indonesian')
        .from('lesson_page_blocks')
        .upsert({
          block_key: block.block_key,
          source_ref: block.source_ref,
          source_refs: block.source_refs ?? [],
          content_unit_slugs: block.content_unit_slugs ?? [],
          block_kind: block.block_kind,
          display_order: block.display_order,
          payload_json: block.payload_json ?? {},
          source_progress_event: block.source_progress_event ?? null,
          capability_key_refs: block.capability_key_refs ?? [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'source_ref,block_key' })
      if (error) throw error
      lessonUpserts++
    }
    totalUpserts += lessonUpserts
    console.log(`lesson-${lessonNumber}: upserted ${lessonUpserts} blocks`)
  }
  console.log(`Total upserts: ${totalUpserts}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
