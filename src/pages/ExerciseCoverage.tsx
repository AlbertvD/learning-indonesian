// src/pages/ExerciseCoverage.tsx
import { useEffect, useState } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconRefresh } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
} from '@/components/page/primitives'
import { logError } from '@/lib/logger'
import { AdminGuard } from '@/pages/admin/AdminGuard'
import { coverageService, type LessonExerciseCoverage } from '@/services/coverageService'
import classes from './ContentCoverage.module.css'

// ── Row definitions ─────────────────────────────────────────────────────────

interface CellValue {
  ok: boolean
  count?: number
  /** Not applicable for this lesson (e.g. dialogue cloze on a lesson without
   *  dialogue) — rendered as a neutral em-dash instead of a false ❌. */
  na?: boolean
}

interface RowDef {
  label: string
  getValue: (c: LessonExerciseCoverage) => CellValue
}

// The two legacy vocab-cloze rows (item_contexts carriers + the vocab
// choose_missing_word heuristic) were removed 2026-07-04: item-source cloze
// was closed NOT_PLANNED (#148), nothing reads those carriers, and the live
// cloze paths are dialogue cloze + the grammar cloze_mcq table below.
const ROWS: RowDef[] = [
  {
    label: 'learning_items in DB',
    getValue: c => ({ ok: c.learningItems > 0, count: c.learningItems }),
  },
  {
    label: 'items with translations (learning_items.translation_nl)',
    getValue: c => ({ ok: c.hasMeanings }),
  },
  {
    label: 'recognition / type_form_ex / choose_form_ex',
    getValue: c => ({ ok: c.learningItems > 0 && c.hasMeanings }),
  },
  {
    label: 'dialogue cloze (dialogue_clozes)',
    getValue: c =>
      c.dialogueLines === 0
        ? { ok: true, na: true }
        : { ok: c.dialogueClozes > 0, count: c.dialogueClozes },
  },
  {
    label: 'affix pairs / morphology (lesson_section_affixed_pairs)',
    getValue: c => ({ ok: c.affixedPairs > 0, count: c.affixedPairs }),
  },
  {
    label: 'grammar_patterns in DB',
    getValue: c => ({ ok: c.grammarPatterns > 0, count: c.grammarPatterns }),
  },
  {
    label: 'grammar exercises in DB (typed tables)',
    getValue: c => {
      const total = Object.values(c.exerciseVariants).reduce((s, n) => s + n, 0)
      return { ok: total > 0, count: total }
    },
  },
  {
    label: 'choose_correct_form_ex / transform_sentence_ex / translate_sentence_ex',
    getValue: c => ({
      ok: (c.exerciseVariants['choose_correct_form_ex'] ?? 0) > 0
        || (c.exerciseVariants['transform_sentence_ex'] ?? 0) > 0
        || (c.exerciseVariants['translate_sentence_ex'] ?? 0) > 0,
    }),
  },
  {
    label: 'choose_missing_word_ex (grammar)',
    getValue: c => ({
      ok: (c.exerciseVariants['choose_missing_word_ex'] ?? 0) > 0,
      count: c.exerciseVariants['choose_missing_word_ex'] ?? 0,
    }),
  },
]

// ── Cell ────────────────────────────────────────────────────────────────────

function Cell({ ok, count, na }: CellValue) {
  if (na) {
    return <td className={classes.cell}>—</td>
  }
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
  const [coverage, setCoverage] = useState<LessonExerciseCoverage[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await coverageService.getExerciseCoverage()
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
      <AdminGuard>
        <PageContainer size="xl">
          <PageBody>
            <LoadingState />
          </PageBody>
        </PageContainer>
      </AdminGuard>
    )
  }

  if (!coverage) return null

  return (
    <AdminGuard>
    <PageContainer size="xl">
      <PageBody>
        <PageHeader
          title="Exercise Coverage"
          subtitle="Which exercise types are available per lesson based on published content."
          action={(
            <Tooltip label="Refresh">
              <ActionIcon variant="subtle" size="lg" onClick={load} loading={loading} aria-label="Refresh">
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        />

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
      </PageBody>
    </PageContainer>
    </AdminGuard>
  )
}
