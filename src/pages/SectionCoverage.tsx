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
import { logError } from '@/lib/logger'
import { AdminGuard } from '@/pages/admin/AdminGuard'
import { coverageService, type LessonSectionCoverage } from '@/services/coverageService'
import classes from './ContentCoverage.module.css'

// ── Row definitions ─────────────────────────────────────────────────────────

interface CellValue {
  ok: boolean
}

interface RowDef {
  label: string
  getValue: (c: LessonSectionCoverage) => CellValue
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
  const [data, setData] = useState<LessonSectionCoverage[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setData(await coverageService.getSectionCoverage())
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
      <AdminGuard>
        <PageContainer size="xl">
          <PageBody>
            <LoadingState />
          </PageBody>
        </PageContainer>
      </AdminGuard>
    )
  }

  if (!data) return null

  return (
    <AdminGuard>
    <PageContainer size="xl">
      <PageBody>
        <PageHeader
          title="Section Coverage"
          subtitle="Which section types are published per lesson."
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
    </AdminGuard>
  )
}
