// src/services/coverageService.ts
//
// Admin-only coverage queries. Powers the /content/sections and
// /content/exercises pages. The shape of the returned types is fixed by what
// the table renderers in SectionCoverage.tsx + ExerciseCoverage.tsx consume —
// keep it stable when refactoring.
//
// Reads internal pipeline tables (item_contexts, item_meanings, lesson_sections,
// grammar_patterns, item_context_grammar_patterns, and the 4 typed
// grammar-exercise tables). exercise_variants is NO LONGER read here (Slice 2
// Task 8 — grammar exercises moved to the typed tables; the
// noExerciseVariantsReader enforcement test guards this). RLS gates this for
// non-admins, and the pages additionally wrap themselves in <AdminGuard>.

import { supabase } from '@/lib/supabase'

export interface LessonSectionCoverage {
  lessonId: string
  orderIndex: number
  title: string
  sectionTypes: Set<string>
}

export interface LessonExerciseCoverage {
  lessonId: string
  orderIndex: number
  title: string
  learningItems: number
  hasMeanings: boolean
  clozeContexts: number
  grammarPatterns: number
  exerciseVariants: Record<string, number>
}

export async function getSectionCoverage(): Promise<LessonSectionCoverage[]> {
  const [
    { data: lessons, error: lessonsError },
    { data: sections, error: sectionsError },
  ] = await Promise.all([
    supabase.schema('indonesian').from('lessons').select('id, order_index, title').order('order_index'),
    supabase.schema('indonesian').from('lesson_sections').select('lesson_id, content'),
  ])

  if (lessonsError) throw lessonsError
  if (sectionsError) throw sectionsError

  const map = new Map<string, LessonSectionCoverage>()
  for (const lesson of lessons ?? []) {
    map.set(lesson.id, {
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      title: lesson.title,
      sectionTypes: new Set(),
    })
  }

  for (const section of sections ?? []) {
    const entry = map.get(section.lesson_id)
    if (!entry) continue
    const type = (section.content as Record<string, unknown>)?.type
    if (typeof type === 'string') entry.sectionTypes.add(type)
  }

  return [...map.values()].sort((a, b) => a.orderIndex - b.orderIndex)
}

// The 4 typed grammar-exercise tables, paired with their exercise_type label.
// Slice 2 Task 8: these REPLACE exercise_variants as the grammar-exercise source
// for coverage. exercise_variants is no longer read in src/ (the
// noExerciseVariantsReader enforcement test depends on this).
const GRAMMAR_EXERCISE_TABLES = [
  { table: 'contrast_pair_exercises', type: 'contrast_pair' },
  { table: 'sentence_transformation_exercises', type: 'sentence_transformation' },
  { table: 'constrained_translation_exercises', type: 'constrained_translation' },
  { table: 'cloze_mcq_exercises', type: 'cloze_mcq' },
] as const

export async function getExerciseCoverage(): Promise<LessonExerciseCoverage[]> {
  const [
    { data: lessons, error: lessonsError },
    { data: contexts, error: ctxError },
    { data: meanings, error: meaningsError },
    { data: grammarLinks, error: grammarError },
    { data: grammarPatternsByLesson, error: gpLessonError },
    ...typedResults
  ] = await Promise.all([
    supabase.schema('indonesian').from('lessons').select('id, order_index, title').order('order_index'),
    supabase.schema('indonesian').from('item_contexts').select('id, source_lesson_id, learning_item_id, context_type'),
    supabase.schema('indonesian').from('item_meanings').select('learning_item_id'),
    supabase.schema('indonesian').from('item_context_grammar_patterns').select('context_id, grammar_pattern_id'),
    supabase.schema('indonesian').from('grammar_patterns').select('id, introduced_by_lesson_id').not('introduced_by_lesson_id', 'is', null),
    // Grammar exercises now live in the 4 typed tables (each carries lesson_id +
    // grammar_pattern_id), NOT exercise_variants. Vocab exercises are
    // runtime-generated (never persisted), so there is no vocab-exercise row source.
    ...GRAMMAR_EXERCISE_TABLES.map(({ table }) =>
      supabase.schema('indonesian').from(table).select('lesson_id, grammar_pattern_id').eq('is_active', true),
    ),
  ])

  if (lessonsError) throw lessonsError
  if (ctxError) throw ctxError
  if (meaningsError) throw meaningsError
  if (grammarError) throw grammarError
  if (gpLessonError) throw gpLessonError
  // Typed grammar-exercise rows, paired with their exercise_type.
  const typedExercises: Array<{ lesson_id: string; grammar_pattern_id: string; type: string }> = []
  typedResults.forEach((res, i) => {
    if (res.error) throw res.error
    const type = GRAMMAR_EXERCISE_TABLES[i].type
    for (const row of (res.data ?? []) as Array<{ lesson_id: string; grammar_pattern_id: string }>) {
      typedExercises.push({ lesson_id: row.lesson_id, grammar_pattern_id: row.grammar_pattern_id, type })
    }
  })

  // Build lookup: context_id → source_lesson_id
  const contextToLesson = new Map<string, string>()
  for (const ctx of contexts ?? []) {
    if (ctx.source_lesson_id) contextToLesson.set(ctx.id, ctx.source_lesson_id)
  }

  // Build lookup: learning_item_id → has meaning
  const meaningItemIds = new Set((meanings ?? []).map(m => m.learning_item_id))

  // Initialise coverage map
  const coverageMap = new Map<string, LessonExerciseCoverage>()
  for (const lesson of lessons ?? []) {
    coverageMap.set(lesson.id, {
      lessonId: lesson.id,
      orderIndex: lesson.order_index,
      title: lesson.title,
      learningItems: 0,
      hasMeanings: false,
      clozeContexts: 0,
      grammarPatterns: 0,
      exerciseVariants: {},
    })
  }

  // learning_items, meanings, cloze contexts — via item_contexts
  const lessonItemIds = new Map<string, Set<string>>()
  for (const ctx of contexts ?? []) {
    if (!ctx.source_lesson_id) continue
    const cov = coverageMap.get(ctx.source_lesson_id)
    if (!cov) continue

    if (ctx.learning_item_id) {
      if (!lessonItemIds.has(ctx.source_lesson_id)) lessonItemIds.set(ctx.source_lesson_id, new Set())
      lessonItemIds.get(ctx.source_lesson_id)!.add(ctx.learning_item_id)
    }

    if (ctx.context_type === 'cloze') cov.clozeContexts++
  }

  for (const [lessonId, itemIds] of lessonItemIds) {
    const cov = coverageMap.get(lessonId)
    if (!cov) continue
    cov.learningItems = itemIds.size
    cov.hasMeanings = [...itemIds].some(id => meaningItemIds.has(id))
  }

  // Grammar patterns per lesson:
  //   Path A (vocab lessons): item_context_grammar_patterns → item_contexts.source_lesson_id
  //   Path B (grammar exercises): the 4 typed exercise tables' lesson_id + grammar_pattern_id
  //   Path C: grammar_patterns.introduced_by_lesson_id (direct lesson link at publish time)
  const lessonGrammarPatterns = new Map<string, Set<string>>()

  // Path A junction is LEGACY-ONLY after Slice 2 Task 9: publish-grammar-candidates.ts
  // (its sole writer) was retired, so no new item_context_grammar_patterns rows are
  // created. Surviving legacy rows still count here; new patterns are covered by
  // Path C (introduced_by_lesson_id), the authoritative direct link.
  for (const link of grammarLinks ?? []) {
    const lessonId = contextToLesson.get(link.context_id)
    if (!lessonId) continue
    if (!lessonGrammarPatterns.has(lessonId)) lessonGrammarPatterns.set(lessonId, new Set())
    lessonGrammarPatterns.get(lessonId)!.add(link.grammar_pattern_id)
  }

  for (const ex of typedExercises) {
    if (ex.lesson_id && ex.grammar_pattern_id) {
      if (!lessonGrammarPatterns.has(ex.lesson_id)) lessonGrammarPatterns.set(ex.lesson_id, new Set())
      lessonGrammarPatterns.get(ex.lesson_id)!.add(ex.grammar_pattern_id)
    }
  }

  for (const gp of grammarPatternsByLesson ?? []) {
    if (!gp.introduced_by_lesson_id) continue
    if (!lessonGrammarPatterns.has(gp.introduced_by_lesson_id)) lessonGrammarPatterns.set(gp.introduced_by_lesson_id, new Set())
    lessonGrammarPatterns.get(gp.introduced_by_lesson_id)!.add(gp.id)
  }

  for (const [lessonId, patterns] of lessonGrammarPatterns) {
    const cov = coverageMap.get(lessonId)
    if (cov) cov.grammarPatterns = patterns.size
  }

  // Grammar exercises per lesson and type, from the 4 typed tables (each row
  // carries lesson_id directly). The `exerciseVariants` field name is kept for
  // the ExerciseCoverage.tsx renderer; it now holds grammar exercise-type counts.
  // Vocab exercises are runtime-generated (never persisted) → not counted here.
  for (const ex of typedExercises) {
    if (!ex.lesson_id) continue
    const cov = coverageMap.get(ex.lesson_id)
    if (!cov) continue
    cov.exerciseVariants[ex.type] = (cov.exerciseVariants[ex.type] ?? 0) + 1
  }

  return [...coverageMap.values()].sort((a, b) => a.orderIndex - b.orderIndex)
}

export const coverageService = {
  getSectionCoverage,
  getExerciseCoverage,
}
