import { Checkbox, Group, Text, Button } from '@mantine/core'
import { useT } from '@/hooks/useT'

// Frameless, controlled activation control — the host page owns the activation
// state (via useLessonActivation) and the card/banner frame. This component is
// purely presentational so the same state can drive the practice CTA without a
// second source of truth. The runtime wiring (RPC, optimistic update, error
// handling, notification) lives in useLessonActivation.
//
// `loadFailed`/`onRetryLoad` (2026-07-11 prod-ready audit): when the initial
// activation fetch failed, `activated` is a guess (defaults to false), not a
// fact — rendering the checkbox as unchecked would misrepresent an already-
// activated lesson. Render a small inline notice + retry instead.
export function ActivationGate({
  activated,
  saving,
  onToggle,
  loadFailed = false,
  onRetryLoad,
}: {
  activated: boolean
  saving: boolean
  onToggle: (next: boolean) => void
  loadFailed?: boolean
  onRetryLoad?: () => void
}) {
  const T = useT()

  if (loadFailed) {
    return (
      <Group gap="xs" wrap="wrap" data-testid="lesson-activation-load-error">
        <Text size="sm" c="dimmed">
          {T.lessons.activationLoadFailed}
        </Text>
        {onRetryLoad && (
          <Button size="xs" variant="light" color="red" onClick={onRetryLoad}>
            {T.common.retry}
          </Button>
        )}
      </Group>
    )
  }

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
