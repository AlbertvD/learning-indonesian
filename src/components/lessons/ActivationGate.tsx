import { useState } from 'react'
import { Checkbox, Group, Text, Button, Modal } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import { FREE_TIER_MAX_LESSON } from '@/services/entitlementService'
import { PaywallPanel } from '@/components/paywall/PaywallPanel'

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
//
// `orderIndex` (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §5,
// lesson-activation gating mirror): for a lesson beyond FREE_TIER_MAX_LESSON
// where the caller isn't entitled, a compact locked-lesson CTA replaces the
// checkbox instead of letting the user flip a toggle the server will reject
// (`entitlement_required` — the real gate is `set_lesson_activation`, this is
// UX only). Deactivation stays available: the CTA only replaces the checkbox
// while `!activated`, so a lesson activated before a subscription lapsed can
// still be turned off.
export function ActivationGate({
  activated,
  saving,
  onToggle,
  loadFailed = false,
  onRetryLoad,
  orderIndex,
}: {
  activated: boolean
  saving: boolean
  onToggle: (next: boolean) => void
  loadFailed?: boolean
  onRetryLoad?: () => void
  orderIndex?: number
}) {
  const T = useT()
  const isEntitled = useAuthStore(s => s.profile?.isEntitled ?? false)
  const [modalOpen, setModalOpen] = useState(false)

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

  const isPaidLesson = orderIndex !== undefined && orderIndex > FREE_TIER_MAX_LESSON
  if (isPaidLesson && !isEntitled && !activated) {
    return (
      <>
        <Group gap="sm" wrap="wrap" data-testid="lesson-paywall-cta">
          <IconLock size={18} aria-hidden="true" />
          <div>
            <Text size="sm" fw={600}>{T.lessons.lessonLockedTitle}</Text>
            <Text size="xs" c="dimmed">{T.lessons.lessonLockedHint}</Text>
          </div>
          <Button size="xs" onClick={() => setModalOpen(true)}>
            {T.lessons.viewPlans}
          </Button>
        </Group>
        <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={T.lessons.unlockModalTitle} size="lg">
          <PaywallPanel />
        </Modal>
      </>
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
