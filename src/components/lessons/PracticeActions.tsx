import { useEffect, useMemo, useState } from 'react'
import { Button, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import {
  buildLessonPracticeActions,
  getLessonCapabilityPracticeSummaryByLessonId,
} from '@/lib/lessons'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

// Renders the two practice CTAs ("Practice this lesson · N ready" + "Review")
// wired to the capability runtime. The host page composes the frame and owns
// activation state (via useLessonActivation), passing `activated` in so the CTA
// reacts the instant the activation control is toggled — no second source of
// truth, no manual reload. See docs/target-architecture.md:59-61.
export function PracticeActions({ lessonId, activated }: { lessonId: string; activated: boolean }) {
  const userId = useAuthStore(s => s.user?.id)
  const userLanguage = useAuthStore(s => s.profile?.language ?? 'nl')
  const T = useT()
  const [readyCount, setReadyCount] = useState(0)
  const [practicedCount, setPracticedCount] = useState(0)
  // Distinguishes "the fetch failed" from "the fetch succeeded and there are
  // genuinely zero ready exercises" — collapsing these into the same 0/0
  // state made every network hiccup read as a false "no exercises available"
  // dead end with no way back in. See docs/audits/2026-07-11-prod-ready.md.
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      try {
        setLoadFailed(false)
        const summary = await getLessonCapabilityPracticeSummaryByLessonId(userId!, lessonId)
        if (cancelled) return
        setReadyCount(summary.readyCapabilityCount)
        setPracticedCount(summary.activePracticedCapabilityCount)
      } catch (err) {
        if (cancelled) return
        setLoadFailed(true)
        logError({ page: 'lesson-page', action: 'load-practice-counts', error: err })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [userId, lessonId, retryToken])

  const actions = useMemo(() => {
    const practiceReadyCount = activated ? Math.max(0, readyCount - practicedCount) : 0
    return buildLessonPracticeActions({
      lessonId,
      state: {
        practiceReadyCount,
        hasUnpracticedEligibleItems: practiceReadyCount > 0,
        hasActivePracticedItems: practicedCount > 0,
      },
      userLanguage,
    })
  }, [lessonId, readyCount, practicedCount, activated, userLanguage])

  if (loadFailed) {
    return (
      <Stack gap={8}>
        <Text size="sm" c="red">{T.lessons.practiceActionsLoadFailed}</Text>
        <Button variant="default" fullWidth onClick={() => setRetryToken(n => n + 1)}>
          {T.lessons.retry}
        </Button>
      </Stack>
    )
  }

  if (actions.length === 0) {
    return (
      <Button variant="default" disabled fullWidth>
        {T.lessons.noExercisesAvailable}
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
