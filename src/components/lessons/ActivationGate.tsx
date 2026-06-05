import { Checkbox } from '@mantine/core'
import { useT } from '@/hooks/useT'

// Frameless, controlled activation control — the host page owns the activation
// state (via useLessonActivation) and the card/banner frame. This component is
// purely presentational so the same state can drive the practice CTA without a
// second source of truth. The runtime wiring (RPC, optimistic update, error
// handling, notification) lives in useLessonActivation.
export function ActivationGate({
  activated,
  saving,
  onToggle,
}: {
  activated: boolean
  saving: boolean
  onToggle: (next: boolean) => void
}) {
  const T = useT()
  return (
    <Checkbox
      checked={activated}
      disabled={saving}
      onChange={(event) => onToggle(event.currentTarget.checked)}
      label={`${T.lessons.activateThisLesson}. ${T.lessons.activateThisLessonHint}`}
      data-testid="lesson-activation-checkbox"
    />
  )
}
