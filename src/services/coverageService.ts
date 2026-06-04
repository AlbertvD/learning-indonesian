// src/services/coverageService.ts
//
// Admin-only coverage queries. Powers the /content/sections and
// /content/exercises pages. The shape of the returned types is fixed by what
// the table renderers in SectionCoverage.tsx + ExerciseCoverage.tsx consume —
// keep it stable when refactoring.
//
// Reads internal pipeline tables (item_contexts, learning_items, lesson_sections,
// grammar_patterns, and the 4 typed grammar-exercise tables). exercise_variants is
// NO LONGER read here (Slice 2 Task 8). Slice 4a: item_meanings (→ learning_items.
// translation_nl, Decision R) and item_context_grammar_patterns (→ grammar_patterns.
// introduced_by_lesson_id) are no longer read — both tables are dropped this slice.
// RLS gates this for non-admins, and the pages additionally wrap themselves in <AdminGuard>.

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
    { data: translatedItems, error: translatedError },
    { data: grammarPatternsByLesson, error: gpLessonError },
    ...typedResults
  ] = await Promise.all([
    supabase.schema('indonesian').from('lessons').select('id, order_index, title').order('order_index'),
    supabase.schema('indonesian').from('item_contexts').select('id, source_lesson_id, learning_item_id, context_type'),
    // Slice 4a (Decision R): hasMeanings is sourced from learning_items.translation_nl,
    // not the retired item_meanings table. An item "has a meaning" iff it carries a translation.
    supabase.schema('indonesian').from('learning_items').select('id').not('translation_nl', 'is', null),
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
  if (translatedError) throw translatedError
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

  // Build lookup: learning_item_id → has a translation (Decision R)
  const translatedItemIds = new Set((translatedItems ?? []).map(it => it.id))

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
    cov.hasMeanings = [...itemIds].some(id => translatedItemIds.has(id))
  }

  // Grammar patterns per lesson:
  //   Path B (grammar exercises): the 4 typed exercise tables' lesson_id + grammar_pattern_id
  //   Path C: grammar_patterns.introduced_by_lesson_id (direct lesson link at publish time)
  // Slice 4a: the legacy Path A (item_context_grammar_patterns junction) was removed —
  // the table is dropped this slice; it had 0 live rows and was fully subsumed by Path C
  // (introduced_by_lesson_id), the authoritative direct link, once its writer retired (Slice 2).
  const lessonGrammarPatterns = new Map<string, Set<string>>()

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
