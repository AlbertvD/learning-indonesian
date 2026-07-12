// src/hooks/useLessonActivation.ts
//
// React binding for per-learner lesson activation. The canonical owner of
// activation state is `lib/lessons/` (the `learner_lesson_activation` table,
// read via isLessonActivated, written via the set_lesson_activation RPC); this
// hook holds the single client-side copy and the runtime wiring (optimistic
// update, error handling, notification) so bespoke lesson pages don't repeat
// it. The host page calls this ONCE and passes the result to both the
// activation control and the practice CTA, so toggling one updates the other
// without a second source of truth. See docs/target-architecture.md:59-61
// ("no concept stored in two places") and §`lib/lessons/`.
//
// `loadFailed`/`retryLoad` (2026-07-11 prod-ready audit): the initial
// isLessonActivated fetch used to fail silently, leaving `activated=false` —
// indistinguishable from "genuinely not activated" and, for an already-
// activated lesson, confidently wrong. Consumers (ActivationGate) now render
// an inline notice + retry instead of trusting `activated` when this is true.
import { useCallback, useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { isLessonActivated, setLessonActivated } from '@/lib/lessons'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export interface LessonActivation {
  activated: boolean
  saving: boolean
  loadFailed: boolean
  toggle: (next: boolean) => Promise<void>
  retryLoad: () => void
}

export function useLessonActivation(lessonId: string): LessonActivation {
  const userId = useAuthStore(s => s.user?.id)
  const T = useT()
  const [activated, setActivated] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoadFailed(false)
    isLessonActivated(userId, lessonId)
      .then(value => { if (!cancelled) setActivated(value) })
      .catch(err => {
        if (cancelled) return
        logError({ page: 'lesson-page', action: 'load-activation', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
        setLoadFailed(true)
      })
    return () => { cancelled = true }
  }, [userId, lessonId, retryTick, T])

  const retryLoad = useCallback(() => setRetryTick(t => t + 1), [])

  const toggle = useCallback(async (next: boolean) => {
    if (!userId || saving) return
    const previous = activated
    setActivated(next)
    setSaving(true)
    try {
      await setLessonActivated(userId, lessonId, next)
      notifications.show({
        color: 'teal',
        message: next ? T.lessons.lessonActivated : T.lessons.lessonDeactivated,
      })
    } catch (err) {
      setActivated(previous)
      logError({ page: 'lesson-page', action: 'toggle-activation', error: err })
      notifications.show({
        color: 'red',
        title: T.lessons.activationFailed,
        message: T.common.somethingWentWrong,
      })
    } finally {
      setSaving(false)
    }
  }, [userId, lessonId, saving, activated, T])

  return { activated, saving, loadFailed, toggle, retryLoad }
}
