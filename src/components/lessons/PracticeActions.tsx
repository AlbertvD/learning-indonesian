import { useEffect, useMemo, useState } from 'react'
import { Button, Stack } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import { isLessonActivated } from '@/lib/lessons/activation'
import { buildLessonPracticeActions } from '@/lib/lessons/lessonActionModel'
import { lessonService } from '@/services/lessonService'
import { logError } from '@/lib/logger'

// Renders the two practice CTAs ("Practice this lesson · N ready" + "Review")
// wired to the capability runtime. The host page composes the frame.
export function PracticeActions({ lessonId }: { lessonId: string }) {
  const userId = useAuthStore(s => s.user?.id)
  const [readyCount, setReadyCount] = useState(0)
  const [practicedCount, setPracticedCount] = useState(0)
  const [activated, setActivated] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      try {
        const lesson = await lessonService.getLesson(lessonId)
        const canonicalSourceRef = `lesson-${lesson.order_index}`
        // Capabilities are linked to per-item source refs (e.g. item-pisang,
        // pattern-werkwoord), not to the parent lesson-N. Aggregate them from
        // the lesson's page blocks — same pattern Lesson.tsx uses.
        const pageBlocks = await lessonService.getLessonPageBlocks(canonicalSourceRef).catch(() => [])
        const refs = pageBlocks.flatMap(b => b.source_refs?.length ? b.source_refs : [b.source_ref]).filter(Boolean)
        const sourceRefs = refs.length > 0 ? [...new Set(refs)] : [canonicalSourceRef]
        const [summary, isActive] = await Promise.all([
          lessonService.getLessonCapabilityPracticeSummary(userId!, sourceRefs).catch(() => ({
            readyCapabilityCount: 0,
            activePracticedCapabilityCount: 0,
          })),
          isLessonActivated(userId!, lessonId).catch(() => false),
        ])
        if (cancelled) return
        setReadyCount(summary.readyCapabilityCount)
        setPracticedCount(summary.activePracticedCapabilityCount)
        setActivated(isActive)
      } catch (err) {
        logError({ page: 'lesson-page', action: 'load-practice-counts', error: err })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [userId, lessonId])

  const actions = useMemo(() => {
    const practiceReadyCount = activated ? Math.max(0, readyCount - practicedCount) : 0
    return buildLessonPracticeActions({
      lessonId,
      state: {
        practiceReadyCount,
        hasUnpracticedEligibleItems: practiceReadyCount > 0,
        hasActivePracticedItems: practicedCount > 0,
      },
    })
  }, [lessonId, readyCount, practicedCount, activated])

  if (actions.length === 0) {
    return (
      <Button variant="default" disabled fullWidth>
        Geen oefeningen beschikbaar
      </Button>
    )
  }

  return (
    <Stack gap={8}>
      {actions.map((action) => {
        const isPrimary = action.priority === 'primary'
        return (
          <Button
            key={action.kind}
            component={Link}
            to={action.href}
            variant={isPrimary ? 'filled' : 'default'}
            color={isPrimary ? 'cyan' : undefined}
            leftSection={action.kind === 'practice' ? <IconPlayerPlay size={16} /> : <IconRotateClockwise size={16} />}
            fullWidth
          >
            {action.label}
          </Button>
        )
      })}
    </Stack>
  )
}
