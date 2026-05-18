import { useEffect, useState } from 'react'
import { Checkbox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { isLessonActivated, setLessonActivated } from '@/lib/lessons/activation'
import { logError } from '@/lib/logger'

// Frameless activation control — the host page provides the card/banner frame.
// Wraps the existing activation lib so the runtime wiring (RPC, optimistic
// update, error handling) stays out of every bespoke page.
export function ActivationGate({ lessonId }: { lessonId: string }) {
  const userId = useAuthStore(s => s.user?.id)
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

  async function handleToggle(next: boolean) {
    if (!userId || saving) return
    const previous = activated
    setActivated(next)
    setSaving(true)
    try {
      await setLessonActivated(userId, lessonId, next)
      notifications.show({
        color: 'teal',
        message: next ? 'Les toegevoegd aan oefeningen' : 'Les verwijderd uit oefeningen',
      })
    } catch (err) {
      setActivated(previous)
      logError({ page: 'lesson-page', action: 'toggle-activation', error: err })
      notifications.show({
        color: 'red',
        title: 'Activatie mislukte',
        message: 'Probeer het later opnieuw.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Checkbox
      checked={activated}
      disabled={saving}
      onChange={(event) => void handleToggle(event.currentTarget.checked)}
      label="Activeer deze les en voeg de woorden en patronen toe aan je oefeningen."
      data-testid="lesson-activation-checkbox"
    />
  )
}
