// src/pages/ExerciseCoverage.tsx
import { useEffect, useState } from 'react'
import { Center, Loader, Container, Group, Title, Text, ActionIcon, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRefresh } from '@tabler/icons-react'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
import classes from './ContentCoverage.module.css'

// ── Data types ──────────────────────────────────────────────────────────────

interface LessonCoverage {
  lessonId: string
  orderIndex: number
  title: string
  learningItems: number
  hasMeanings: boolean
  clozeContexts: number
  grammarPatterns: number
  exerciseVariants: Record<string, number>
}

// ── Data fetching ───────────────────────────────────────────────────────────

async function fetchCoverage(): Promise<LessonCoverage[]> {
  const [
    { data: lessons, error: lessonsError },
    { data: contexts, error: ctxError },
    { data: meanings, error: meaningsError },
    { data: variants, error: variantsError },
    { data: grammarLinks, error: grammarError },
    { data: grammarPatternsByLesson, error: gpLessonError },
  ] = await Promise.all([
    supabase.schema('indonesian').from('lessons').select('id, order_index, title').order('order_index'),
    supabase.schema('indonesian').from('item_contexts').select('id, source_lesson_id, learning_item_id, context_type'),
    supabase.schema('indonesian').from('item_meanings').select('learning_item_id'),
    // Fetch both context_id (vocab exercises) and lesson_id + grammar_pattern_id (grammar exercises)
    supabase.schema('indonesian').from('exercise_variants')
      .select('exercise_type, context_id, lesson_id, grammar_pattern_id')
      .eq('is_active', true),
    supabase.schema('indonesian').from('item_context_grammar_patterns').select('context_id, grammar_pattern_id'),
    supabase.schema('indonesian').from('grammar_patterns').select('id, introduced_by_lesson_id').not('introduced_by_lesson_id', 'is', null),
  ])

  if (lessonsError) throw lessonsError
  if (ctxError) throw ctxError
  if (meaningsError) throw meaningsError
  if (variantsError) throw variantsError
  if (grammarError) throw grammarError
  if (gpLessonError) throw gpLessonError

  // Build lookup: context_id → source_lesson_id
  const contextToLesson = new Map<string, string>()
  for (const ctx of contexts ?? []) {
    if (ctx.source_lesson_id) contextToLesson.set(ctx.id, ctx.source_lesson_id)
  }

  // Build lookup: learning_item_id → has meaning
  const meaningItemIds = new Set((meanings ?? []).map(m => m.learning_item_id))

  // Initialise coverage map
  const coverageMap = new Map<string, LessonCoverage>()
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
  //   Path B (grammar exercises): exercise_variants.lesson_id + grammar_pattern_id
  const lessonGrammarPatterns = new Map<string, Set<string>>()

  for (const link of grammarLinks ?? []) {
    const lessonId = contextToLesson.get(link.context_id)
    if (!lessonId) continue
    if (!lessonGrammarPatterns.has(lessonId)) lessonGrammarPatterns.set(lessonId, new Set())
    lessonGrammarPatterns.get(lessonId)!.add(link.grammar_pattern_id)
  }

  for (const variant of variants ?? []) {
    if (variant.lesson_id && variant.grammar_pattern_id) {
      if (!lessonGrammarPatterns.has(variant.lesson_id)) lessonGrammarPatterns.set(variant.lesson_id, new Set())
      lessonGrammarPatterns.get(variant.lesson_id)!.add(variant.grammar_pattern_id)
    }
  }

  // Path C: grammar_patterns.introduced_by_lesson_id (direct lesson link at publish time)
  for (const gp of grammarPatternsByLesson ?? []) {
    if (!gp.introduced_by_lesson_id) continue
    if (!lessonGrammarPatterns.has(gp.introduced_by_lesson_id)) lessonGrammarPatterns.set(gp.introduced_by_lesson_id, new Set())
    lessonGrammarPatterns.get(gp.introduced_by_lesson_id)!.add(gp.id)
  }

  for (const [lessonId, patterns] of lessonGrammarPatterns) {
    const cov = coverageMap.get(lessonId)
    if (cov) cov.grammarPatterns = patterns.size
  }

  // Exercise variants per lesson and type:
  //   Path A: context_id → contextToLesson (vocab exercises)
  //   Path B: lesson_id directly (grammar exercises)
  for (const variant of variants ?? []) {
    const lessonId = variant.lesson_id ?? contextToLesson.get(variant.context_id)
    if (!lessonId) continue
    const cov = coverageMap.get(lessonId)
    if (!cov) continue
    cov.exerciseVariants[variant.exercise_type] = (cov.exerciseVariants[variant.exercise_type] ?? 0) + 1
  }

  return [...coverageMap.values()].sort((a, b) => a.orderIndex - b.orderIndex)
}

// ── Row definitions ─────────────────────────────────────────────────────────

interface CellValue {
  ok: boolean
  count?: number
}

interface RowDef {
  label: string
  getValue: (c: LessonCoverage) => CellValue
}

const ROWS: RowDef[] = [
  {
    label: 'learning_items in DB',
    getValue: c => ({ ok: c.learningItems > 0, count: c.learningItems }),
  },
  {
    label: 'item_meanings in DB',
    getValue: c => ({ ok: c.hasMeanings }),
  },
  {
    label: 'recognition / typed_recall / cued_recall',
    getValue: c => ({ ok: c.learningItems > 0 && c.hasMeanings }),
  },
  {
    label: 'cloze contexts (item_contexts)',
    getValue: c => ({ ok: c.clozeContexts > 0, count: c.clozeContexts }),
  },
  {
    label: 'cloze / cloze_mcq (vocabulary)',
    getValue: c => ({ ok: c.clozeContexts > 0 }),
  },
  {
    label: 'grammar_patterns in DB',
    getValue: c => ({ ok: c.grammarPatterns > 0, count: c.grammarPatterns }),
  },
  {
    label: 'exercise_variants in DB',
    getValue: c => {
      const total = Object.values(c.exerciseVariants).reduce((s, n) => s + n, 0)
      return { ok: total > 0, count: total }
    },
  },
  {
    label: 'contrast_pair / sentence_transformation / constrained_translation',
    getValue: c => ({
      ok: (c.exerciseVariants['contrast_pair'] ?? 0) > 0
        || (c.exerciseVariants['sentence_transformation'] ?? 0) > 0
        || (c.exerciseVariants['constrained_translation'] ?? 0) > 0,
    }),
  },
  {
    label: 'cloze_mcq (grammar)',
    getValue: c => ({
      ok: (c.exerciseVariants['cloze_mcq'] ?? 0) > 0,
      count: c.exerciseVariants['cloze_mcq'] ?? 0,
    }),
  },
]

// ── Cell ────────────────────────────────────────────────────────────────────

function Cell({ ok, count }: CellValue) {
  const label = ok ? '✅' : '❌'
  const countStr = count !== undefined ? ` ${count}` : ''
  return (
    <td className={`${classes.cell} ${ok ? classes.cellOk : classes.cellFail}`}>
      {label}{countStr}
    </td>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export function ExerciseCoverage() {
  const [coverage, setCoverage] = useState<LessonCoverage[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchCoverage()
      setCoverage(data)
    } catch (err) {
      logError({ page: 'exercise-coverage', action: 'fetchCoverage', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to load coverage data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  if (!coverage) return null

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Exercise Coverage</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Which exercise types are available per lesson based on published content.
          </Text>
        </div>
        <Tooltip label="Refresh">
          <ActionIcon variant="subtle" size="lg" onClick={load} loading={loading}>
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <div className={classes.tableWrapper}>
        <table className={classes.table}>
          <thead>
            <tr>
              <th className={classes.labelCol} />
              {coverage.map(c => (
                <th key={c.lessonId} className={classes.lessonCol}>
                  <span className={classes.lessonLabel}>L{c.orderIndex}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={i} className={classes.row}>
                <td className={classes.rowLabel}>{row.label}</td>
                {coverage.map(c => {
                  const val = row.getValue(c)
                  return <Cell key={c.lessonId} {...val} />
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  )
}
