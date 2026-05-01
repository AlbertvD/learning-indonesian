// src/pages/SectionCoverage.tsx
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
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
import classes from './ContentCoverage.module.css'

// ── Data types ──────────────────────────────────────────────────────────────

interface LessonSections {
  lessonId: string
  orderIndex: number
  title: string
  sectionTypes: Set<string>
}

// ── Data fetching ───────────────────────────────────────────────────────────

async function fetchSections(): Promise<LessonSections[]> {
  const [
    { data: lessons, error: lessonsError },
    { data: sections, error: sectionsError },
  ] = await Promise.all([
    supabase.schema('indonesian').from('lessons').select('id, order_index, title').order('order_index'),
    supabase.schema('indonesian').from('lesson_sections').select('lesson_id, content'),
  ])

  if (lessonsError) throw lessonsError
  if (sectionsError) throw sectionsError

  const map = new Map<string, LessonSections>()
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

// ── Row definitions ─────────────────────────────────────────────────────────

interface CellValue {
  ok: boolean
}

interface RowDef {
  label: string
  getValue: (c: LessonSections) => CellValue
}

const ROWS: RowDef[] = [
  { label: 'vocabulary',    getValue: c => ({ ok: c.sectionTypes.has('vocabulary') }) },
  { label: 'expressions',   getValue: c => ({ ok: c.sectionTypes.has('expressions') }) },
  { label: 'numbers',       getValue: c => ({ ok: c.sectionTypes.has('numbers') }) },
  { label: 'grammar',       getValue: c => ({ ok: c.sectionTypes.has('grammar') }) },
  { label: 'exercises',     getValue: c => ({ ok: c.sectionTypes.has('exercises') }) },
  { label: 'dialogue',      getValue: c => ({ ok: c.sectionTypes.has('dialogue') }) },
  { label: 'text',          getValue: c => ({ ok: c.sectionTypes.has('text') }) },
  { label: 'pronunciation', getValue: c => ({ ok: c.sectionTypes.has('pronunciation') }) },
  { label: 'reference_table', getValue: c => ({ ok: c.sectionTypes.has('reference_table') }) },
]

// ── Cell ────────────────────────────────────────────────────────────────────

function Cell({ ok }: CellValue) {
  return (
    <td className={`${classes.cell} ${ok ? classes.cellOk : classes.cellFail}`}>
      {ok ? '✅' : '❌'}
    </td>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export function SectionCoverage() {
  const [data, setData] = useState<LessonSections[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setData(await fetchSections())
    } catch (err) {
      logError({ page: 'section-coverage', action: 'fetchSections', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to load section data.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <PageContainer size="xl">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  if (!data) return null

  return (
    <PageContainer size="xl">
      <PageBody>
        <PageHeader
          title="Section Coverage"
          subtitle="Which section types are published per lesson."
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
              {data.map(c => (
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
                {data.map(c => {
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
  )
}
