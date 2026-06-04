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
}

interface RowDef {
  label: string
  getValue: (c: LessonExerciseCoverage) => CellValue
}

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
              <ActionIcon variant="subtle" size="lg" onClick={load} loading={loading}>
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
