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
import { useCallback, useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { isLessonActivated, setLessonActivated } from '@/lib/lessons'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export interface LessonActivation {
  activated: boolean
  saving: boolean
  toggle: (next: boolean) => Promise<void>
}

export function useLessonActivation(lessonId: string): LessonActivation {
  const userId = useAuthStore(s => s.user?.id)
  const T = useT()
  const [activated, setActivated] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    isLessonActivated(userId, lessonId)
      .then(value => { if (!cancelled) setActivated(value) })
      .catch(err => logError({ page: 'lesson-page', action: 'load-activation', error: err }))
    return () => { cancelled = true }
  }, [userId, lessonId])

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

  return { activated, saving, toggle }
}
