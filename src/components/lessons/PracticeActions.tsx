import { useEffect, useMemo, useState } from 'react'
import { Button, Stack } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import {
  buildLessonPracticeActions,
  getLessonCapabilityPracticeSummaryByLessonId,
} from '@/lib/lessons'
import { logError } from '@/lib/logger'

// Renders the two practice CTAs ("Practice this lesson · N ready" + "Review")
// wired to the capability runtime. The host page composes the frame and owns
// activation state (via useLessonActivation), passing `activated` in so the CTA
// reacts the instant the activation control is toggled — no second source of
// truth, no manual reload. See docs/target-architecture.md:59-61.
export function PracticeActions({ lessonId, activated }: { lessonId: string; activated: boolean }) {
  const userId = useAuthStore(s => s.user?.id)
  const [readyCount, setReadyCount] = useState(0)
  const [practicedCount, setPracticedCount] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      try {
        const summary = await getLessonCapabilityPracticeSummaryByLessonId(userId!, lessonId)
        if (cancelled) return
        setReadyCount(summary.readyCapabilityCount)
        setPracticedCount(summary.activePracticedCapabilityCount)
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
