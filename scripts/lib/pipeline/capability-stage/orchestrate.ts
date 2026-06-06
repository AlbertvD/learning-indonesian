/**
 * cap-v2 Slice 1 — populate-pass orchestration (the runnable seam).
 *
 * Thin composition (CLAUDE.md: thin composition of pure functions > stateful
 * runner): seed distractors for every lesson, ascending, so Pool(N) is complete
 * before lesson N is seeded (spec §5 "publish('vocabulary') walks lessons
 * ascending"). The loop is hermetically tested; `populateAllDistractors` is the
 * supabase wiring (lesson listing + store + local embedder), verified at the
 * populate pass.
 *
 * Additive/pre-cutover (spec §7): this runs against the EXISTING item caps
 * (runner-written today) and only writes the `distractors`/`item_embeddings`
 * tables — it does not yet own item-cap creation (that is the cutover).
 */

import type { CapabilitySupabaseClient } from './adapter'
import { createLocalEmbedder, type Embedder } from './shared/embeddings'
import { createDistractorStore } from './vocabulary/store'
import { seedDistractors, type DistractorStore, type SeedOptions, type SeedResult } from './vocabulary/seedDistractors'

export interface LessonRef {
  lessonId: string
  lessonNumber: number
}

export interface LessonSeedResult {
  lessonNumber: number
  lessonId: string
  result: SeedResult
}

/**
 * Seed distractors for each lesson, ascending by lessonNumber (so Pool(N) is
 * complete before lesson N is processed). Pure composition over the injected
 * store + embedder.
 */
export async function populateDistractors(
  lessons: LessonRef[],
  store: DistractorStore,
  embedder: Embedder,
  opts: SeedOptions = {},
): Promise<LessonSeedResult[]> {
  const ascending = [...lessons].sort((a, b) => a.lessonNumber - b.lessonNumber)
  const out: LessonSeedResult[] = []
  for (const { lessonId, lessonNumber } of ascending) {
    const result = await seedDistractors({ lessonId, lessonNumber }, store, embedder, opts)
    out.push({ lessonNumber, lessonId, result })
  }
  return out
}

/**
 * Seed curated distractors for ONE lesson (the publish-flow entry, Stage C after
 * the capability stage). Pool(N) reads all lessons ≤ N from the DB, so seeding a
 * single lesson is correct without re-seeding earlier lessons. Idempotent.
 */
export async function populateLessonDistractors(
  supabase: CapabilitySupabaseClient,
  lesson: LessonRef,
  opts: SeedOptions & { embedder?: Embedder } = {},
): Promise<LessonSeedResult> {
  const { embedder, ...seedOpts } = opts
  const [result] = await populateDistractors(
    [lesson],
    createDistractorStore(supabase),
    embedder ?? createLocalEmbedder(),
    seedOpts,
  )
  return result
}

/** List the published lessons as ascending `LessonRef`s (order_index = number). */
export async function listLessons(supabase: CapabilitySupabaseClient): Promise<LessonRef[]> {
  const { data, error } = await supabase
    .schema('indonesian')
    .from('lessons')
    .select('id, order_index')
    .order('order_index', { ascending: true })
  if (error) throw new Error(`orchestrate.listLessons: ${error.message}`)
  return ((data ?? []) as Array<{ id: string; order_index: number }>).map((l) => ({
    lessonId: l.id,
    lessonNumber: l.order_index,
  }))
}

/**
 * The populate pass: wire the supabase store + local embedder and seed every
 * lesson ascending. Downloads the embedding model on first run; computes
 * `item_embeddings` once per new item; writes curated `distractors` pointers.
 */
export async function populateAllDistractors(
  supabase: CapabilitySupabaseClient,
  opts: SeedOptions & { embedder?: Embedder } = {},
): Promise<LessonSeedResult[]> {
  const { embedder, ...seedOpts } = opts
  const lessons = await listLessons(supabase)
  return populateDistractors(
    lessons,
    createDistractorStore(supabase),
    embedder ?? createLocalEmbedder(),
    seedOpts,
  )
}
