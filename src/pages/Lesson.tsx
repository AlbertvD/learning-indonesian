import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Center, Container, Loader, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  lessonService,
  lessonSourceRefForOverview,
  type Lesson,
  type LessonPageBlock,
  type LessonSourceProgressRow,
} from '@/services/lessonService'
import { sourceProgressService, type SourceProgressState } from '@/services/sourceProgressService'
import { startSession, endSession } from '@/lib/session'
import { useSessionBeacon } from '@/lib/useSessionBeacon'
import { useAuthStore } from '@/stores/authStore'
import { buildLessonExperience, type LessonExperienceBlock } from '@/lib/lessons/lessonExperience'
import { buildLessonPracticeActions, type LessonPracticeActionState } from '@/lib/lessons/lessonActionModel'
import { sourceProgressEventForLessonExposure, type LessonExposureKind } from '@/lib/lessons/lessonExposureProgress'
import { LessonReader } from '@/components/lessons/LessonReader'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'
import classes from './Lesson.module.css'

const PRACTICE_READY_SOURCE_EVENTS = new Set([
  'section_exposed',
  'intro_completed',
  'heard_once',
  'pattern_noticing_seen',
  'guided_practice_completed',
  'lesson_completed',
])

function sourceRefsForBlock(block: LessonPageBlock): string[] {
  return block.source_refs?.length ? block.source_refs : [block.source_ref]
}

function sourceRefsForPageBlocks(blocks: LessonPageBlock[], fallbackSourceRef: string): string[] {
  const refs = blocks.flatMap(sourceRefsForBlock).filter(Boolean)
  return refs.length > 0 ? [...new Set(refs)] : [fallbackSourceRef]
}

function hasPracticeReadyExposure(
  block: LessonExperienceBlock,
  progressBySourceRef: Map<string, SourceProgressState>,
): boolean {
  return block.sourceRefs.some(sourceRef => {
    const progress = progressBySourceRef.get(`${sourceRef}::${block.id}`)
    return progress?.completedEventTypes.some(eventType => PRACTICE_READY_SOURCE_EVENTS.has(eventType)) ?? false
  })
}

function practiceReadyCapabilityCount(
  blocks: LessonExperienceBlock[],
  progressBySourceRef: Map<string, SourceProgressState>,
): number {
  const readyCapabilityKeys = new Set<string>()
  for (const block of blocks) {
    if (block.capabilityKeyRefs.length === 0) continue
    if (!hasPracticeReadyExposure(block, progressBySourceRef)) continue
    block.capabilityKeyRefs.forEach(ref => readyCapabilityKeys.add(ref))
  }
  return readyCapabilityKeys.size
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
  const [lessonSourceProgress, setLessonSourceProgress] = useState<LessonSourceProgressRow[]>([])
  const [readyCapabilityCount, setReadyCapabilityCount] = useState(0)
  const [activePracticedCapabilityCount, setActivePracticedCapabilityCount] = useState(0)
  const sessionIdRef = useRef<string | null>(null)
  const readerOpenedRef = useRef<string | null>(null)
  const practiceReadyToastShownRef = useRef<Set<string>>(new Set())
  useSessionBeacon(sessionIdRef)

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
      setLessonSourceProgress([])
      setReadyCapabilityCount(0)
      setActivePracticedCapabilityCount(0)

      try {
        const [lessonData, sid] = await Promise.all([
          lessonService.getLesson(lessonId),
          startSession(userId, 'lesson'),
        ])
        if (cancelled) return

        sessionIdRef.current = sid
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
        const [sourceProgressRows, practiceSummary] = await Promise.all([
          lessonService.getLessonSourceProgress(userId, sourceRefs),
          lessonService.getLessonCapabilityPracticeSummary(userId, sourceRefs).catch(err => {
            logError({ page: 'lesson-reader-v2', action: 'load-practice-summary', error: err })
            return { readyCapabilityCount: 0, activePracticedCapabilityCount: 0 }
          }),
        ])
        if (cancelled) return

        setLessonSourceProgress(sourceProgressRows)
        setReadyCapabilityCount(practiceSummary.readyCapabilityCount)
        setActivePracticedCapabilityCount(practiceSummary.activePracticedCapabilityCount)
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
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current).catch(err => {
          logError({ page: 'lesson', action: 'endSession', error: err })
          notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
        })
      }
    }
  }, [lessonId, userId, T.common.error, T.common.somethingWentWrong, T.lessons.failedToLoadLesson])

  const upsertLessonSourceProgress = useCallback((state: SourceProgressState) => {
    setLessonSourceProgress(rows => [
      ...rows.filter(row => !(row.source_ref === state.sourceRef && row.source_section_ref === state.sourceSectionRef)),
      {
        source_ref: state.sourceRef,
        source_section_ref: state.sourceSectionRef,
        current_state: state.currentState,
        completed_event_types: state.completedEventTypes,
        last_event_at: state.lastEventAt,
      },
    ])
  }, [])

  const handleReaderSourceProgress = useCallback(async (
    block: LessonExperienceBlock,
    eventType: Parameters<typeof sourceProgressService.recordEvent>[0]['eventType'],
  ) => {
    if (!userId || !lesson) return
    const sourceRef = block.sourceRefs[0] ?? block.sourceRef
    try {
      const state = await sourceProgressService.recordEvent({
        userId,
        sourceRef,
        sourceSectionRef: block.id,
        eventType,
        occurredAt: new Date().toISOString(),
        metadataJson: {
          lessonId: lesson.id,
          blockId: block.id,
          blockKind: block.kind,
          capabilityKeyRefs: block.capabilityKeyRefs,
        },
        idempotencyKey: `lesson-reader:${userId}:${sourceRef}:${block.id}:${eventType}`,
      })
      upsertLessonSourceProgress(state)
    } catch (err) {
      logError({ page: 'lesson-reader-v2', action: 'record-source-progress', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToSaveProgress })
    }
  }, [lesson, userId, T.common.error, T.lessons.failedToSaveProgress, upsertLessonSourceProgress])

  const handleLessonExposureProgress = useCallback(async (
    block: LessonExperienceBlock,
    exposureKind: LessonExposureKind,
  ) => {
    if (!userId || !lesson) return
    const sourceRef = block.sourceRefs[0] ?? block.sourceRef
    try {
      const state = await sourceProgressService.recordEvent(sourceProgressEventForLessonExposure({
        userId,
        lessonId: lesson.id,
        sourceRef,
        sourceSectionRef: block.id,
        exposureKind,
        occurredAt: new Date().toISOString(),
        metadata: {
          blockId: block.id,
          blockKind: block.kind,
          capabilityKeyRefs: block.capabilityKeyRefs,
        },
      }))
      upsertLessonSourceProgress(state)

      const toastKey = `${lesson.id}:practice-ready`
      if (
        block.capabilityKeyRefs.length > 0
        && readyCapabilityCount > activePracticedCapabilityCount
        && !practiceReadyToastShownRef.current.has(toastKey)
      ) {
        practiceReadyToastShownRef.current.add(toastKey)
        notifications.show({
          color: 'teal',
          message: T.lessons.readyToPracticeToast(lesson.order_index),
        })
      }
    } catch (err) {
      logError({ page: 'lesson-reader-v2', action: 'record-lesson-exposure', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.lessons.failedToSaveProgress })
    }
  }, [activePracticedCapabilityCount, lesson, readyCapabilityCount, userId, T.common.error, T.lessons, upsertLessonSourceProgress])

  const readerExperience = useMemo(
    () => lesson && lessonPageBlocks.length > 0
      ? buildLessonExperience({ lesson, pageBlocks: lessonPageBlocks })
      : null,
    [lesson, lessonPageBlocks],
  )

  const readerProgressBySourceRef = useMemo(() => new Map<string, SourceProgressState>(
    lessonSourceProgress.map(row => [`${row.source_ref}::${row.source_section_ref}`, {
      userId: userId ?? '',
      sourceRef: row.source_ref,
      sourceSectionRef: row.source_section_ref,
      currentState: row.current_state as SourceProgressState['currentState'],
      completedEventTypes: row.completed_event_types as SourceProgressState['completedEventTypes'],
      lastEventAt: row.last_event_at,
    }]),
  ), [lessonSourceProgress, userId])

  const lessonPracticeActionState: LessonPracticeActionState | null = useMemo(() => {
    if (!readerExperience) return null
    const exposedReadyCapabilityCount = practiceReadyCapabilityCount(readerExperience.blocks, readerProgressBySourceRef)
    const backendUnpracticedReadyCount = Math.max(0, readyCapabilityCount - activePracticedCapabilityCount)
    const practiceReadyCount = Math.min(exposedReadyCapabilityCount, backendUnpracticedReadyCount)
    return {
      practiceReadyCount,
      hasUnpracticedEligibleItems: practiceReadyCount > 0,
      hasActivePracticedItems: activePracticedCapabilityCount > 0,
    }
  }, [activePracticedCapabilityCount, readerExperience, readerProgressBySourceRef, readyCapabilityCount])

  const lessonPracticeActions = useMemo(() => {
    if (!lesson || !lessonPracticeActionState) return []
    return buildLessonPracticeActions({
      lessonId: lesson.id,
      state: lessonPracticeActionState,
    })
  }, [lesson, lessonPracticeActionState])

  useEffect(() => {
    if (!userId || !readerExperience) return
    const heroBlock = readerExperience.blocks.find(block => block.kind === 'lesson_hero')
    if (!heroBlock) return
    const sourceRef = heroBlock.sourceRefs[0] ?? heroBlock.sourceRef
    const progress = readerProgressBySourceRef.get(`${sourceRef}::${heroBlock.id}`)
    if (progress?.completedEventTypes.includes('opened')) return

    const openedKey = `${readerExperience.sourceRef}:${heroBlock.id}:opened`
    if (readerOpenedRef.current === openedKey) return
    readerOpenedRef.current = openedKey
    void handleReaderSourceProgress(heroBlock, 'opened')
  }, [handleReaderSourceProgress, readerExperience, readerProgressBySourceRef, userId])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  if (error || !lesson) {
    return (
      <Center h="50vh">
        <Text c="dimmed">{T.lessons.failedToLoadLesson}</Text>
      </Center>
    )
  }

  if (!readerExperience) {
    return (
      <Container size="sm" className={classes.lesson}>
        <Title order={1} mb="sm">{T.lessons.lessonUnavailableTitle}</Title>
        <Text c="dimmed" mb="xl">{T.lessons.lessonUnavailableCopy}</Text>
        <Button component={Link} to="/lessons" variant="light">
          {T.lessons.backToList}
        </Button>
      </Container>
    )
  }

  return (
    <LessonReader
      experience={readerExperience}
      progressBySourceRef={readerProgressBySourceRef}
      actions={lessonPracticeActions}
      onBack={() => navigate('/lessons')}
      onSourceProgress={handleReaderSourceProgress}
      onLessonExposureProgress={handleLessonExposureProgress}
    />
  )
}
