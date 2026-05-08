import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Checkbox, Paper, Group, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { IconBook2, IconBookmark } from '@tabler/icons-react'
import {
  lessonService,
  lessonSourceRefForOverview,
  type Lesson,
  type LessonPageBlock,
} from '@/services/lessonService'
import { useAuthStore } from '@/stores/authStore'
import { buildLessonExperience } from '@/lib/lessons/lessonExperience'
import { buildLessonPracticeActions, type LessonPracticeActionState } from '@/lib/lessons/lessonActionModel'
import { isLessonActivated, setLessonActivated } from '@/lib/lessons/activation'
import { LessonReader } from '@/components/lessons/LessonReader'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'

function sourceRefsForBlock(block: LessonPageBlock): string[] {
  return block.source_refs?.length ? block.source_refs : [block.source_ref]
}

function sourceRefsForPageBlocks(blocks: LessonPageBlock[], fallbackSourceRef: string): string[] {
  const refs = blocks.flatMap(sourceRefsForBlock).filter(Boolean)
  return refs.length > 0 ? [...new Set(refs)] : [fallbackSourceRef]
}

export function Lesson() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lessonPageBlocks, setLessonPageBlocks] = useState<LessonPageBlock[]>([])
  const [readyCapabilityCount, setReadyCapabilityCount] = useState(0)
  const [activePracticedCapabilityCount, setActivePracticedCapabilityCount] = useState(0)
  const [lessonActivated, setLessonActivatedState] = useState(false)
  const [activationSaving, setActivationSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      if (!lessonId || !userId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(false)
      setLesson(null)
      setLessonPageBlocks([])
      setReadyCapabilityCount(0)
      setActivePracticedCapabilityCount(0)
      setLessonActivatedState(false)

      try {
        const lessonData = await lessonService.getLesson(lessonId)
        if (cancelled) return

        setLesson(lessonData)

        const canonicalSourceRef = lessonSourceRefForOverview(lessonData)
        let pageBlocks: LessonPageBlock[] = []
        try {
          pageBlocks = await lessonService.getLessonPageBlocks(canonicalSourceRef)
        } catch (err) {
          logError({ page: 'lesson-reader-v2', action: 'load-page-blocks', error: err })
        }
        if (cancelled) return

        setLessonPageBlocks(pageBlocks)
        if (pageBlocks.length === 0) return

        const sourceRefs = sourceRefsForPageBlocks(pageBlocks, canonicalSourceRef)
        const [practiceSummary, activated] = await Promise.all([
          lessonService.getLessonCapabilityPracticeSummary(userId, sourceRefs).catch(err => {
            logError({ page: 'lesson-reader-v2', action: 'load-practice-summary', error: err })
            return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }
          }),
          isLessonActivated(userId, lessonData.id).catch(err => {
            logError({ page: 'lesson-reader-v2', action: 'load-activation', error: err })
            return false
          }),
        ])
        if (cancelled) return

        setReadyCapabilityCount(practiceSummary.readyCapabilityCount)
        setActivePracticedCapabilityCount(practiceSummary.activePracticedCapabilityCount)
        setLessonActivatedState(activated)
      } catch (err) {
        logError({ page: 'lesson', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToLoadLesson })
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [lessonId, userId, T.common.error, T.lessons.failedToLoadLesson])

  const readerExperience = useMemo(
    () => lesson && lessonPageBlocks.length > 0
      ? buildLessonExperience({ lesson, pageBlocks: lessonPageBlocks })
      : null,
    [lesson, lessonPageBlocks],
  )

  const lessonPracticeActionState: LessonPracticeActionState | null = useMemo(() => {
    if (!readerExperience) return null
    const practiceReadyCount = lessonActivated
      ? Math.max(0, readyCapabilityCount - activePracticedCapabilityCount)
      : 0
    return {
      practiceReadyCount,
      hasUnpracticedEligibleItems: practiceReadyCount > 0,
      hasActivePracticedItems: activePracticedCapabilityCount > 0,
    }
  }, [activePracticedCapabilityCount, readerExperience, readyCapabilityCount, lessonActivated])

  const lessonPracticeActions = useMemo(() => {
    if (!lesson || !lessonPracticeActionState) return []
    return buildLessonPracticeActions({
      lessonId: lesson.id,
      state: lessonPracticeActionState,
    })
  }, [lesson, lessonPracticeActionState])

  const lessonAudioUrl = useMemo(
    () => lesson?.audio_path ? lessonService.getAudioUrl(lesson.audio_path) : null,
    [lesson],
  )

  const handleToggleActivation = async (next: boolean) => {
    if (!userId || !lesson || activationSaving) return
    const previous = lessonActivated
    setLessonActivatedState(next)
    setActivationSaving(true)
    try {
      await setLessonActivated(userId, lesson.id, next)
      notifications.show({
        color: 'teal',
        message: next ? T.lessons.lessonActivated : T.lessons.lessonDeactivated,
      })
    } catch (err) {
      setLessonActivatedState(previous)
      logError({ page: 'lesson', action: 'toggle-activation', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.lessons.activationFailed })
    } finally {
      setActivationSaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  if (error || !lesson) {
    return (
      <PageContainer size="lg">
        <PageBody>
          <EmptyState icon={<IconBook2 size={48} />} message={T.lessons.failedToLoadLesson} />
        </PageBody>
      </PageContainer>
    )
  }

  if (!readerExperience) {
    return (
      <PageContainer size="md">
        <PageBody>
          <PageHeader title={T.lessons.lessonUnavailableTitle} subtitle={T.lessons.lessonUnavailableCopy} />
          <Button component={Link} to="/lessons" variant="light">
            {T.lessons.backToList}
          </Button>
        </PageBody>
      </PageContainer>
    )
  }

  return (
    <>
      <Paper withBorder radius="md" p="md" mx="md" my="sm">
        <Group wrap="nowrap" align="flex-start">
          <ThemeIcon
            variant="light"
            color={lessonActivated ? 'teal' : 'gray'}
            size="lg"
            radius="md"
          >
            <IconBookmark size={20} />
          </ThemeIcon>
          <Checkbox
            checked={lessonActivated}
            disabled={activationSaving}
            onChange={(event) => void handleToggleActivation(event.currentTarget.checked)}
            label={T.lessons.activateThisLesson}
            description={T.lessons.activateThisLessonHint}
            data-testid="lesson-activation-checkbox"
            style={{ flex: 1 }}
          />
        </Group>
      </Paper>
      <LessonReader
        experience={readerExperience}
        actions={lessonPracticeActions}
        lessonAudioUrl={lessonAudioUrl}
        lessonDurationSeconds={lesson.duration_seconds}
        onBack={() => navigate('/lessons')}
      />
    </>
  )
}
