// src/components/progress/CardErrorNotice.tsx
//
// Shared error state for the Voortgang cards (MasteryFunnelPanel,
// GrowthCurveCard, TimeComparisonCard, DurabilityCard): a compact inline
// notice + retry button, replacing the "render null forever" behaviour those
// cards previously fell into on fetch failure. Extracted once because the
// shape — icon, message, retry action — is identical across all four
// callers; only the loading Skeleton (sized per card) stays local to each
// file (2026-07-11 prod-ready audit, medium/low UX findings).
//
// Pure Mantine layout primitives (Group/Text/Button), no bespoke CSS.
import { Group, Text, Button } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'

export interface CardErrorNoticeProps {
  /** Re-runs the failed fetch. Callers reset their own error/loading state. */
  onRetry: () => void
}

export function CardErrorNotice({ onRetry }: CardErrorNoticeProps) {
  const T = useT()
  return (
    <Group gap="xs" justify="center" wrap="wrap" py="lg">
      <IconAlertCircle size={18} color="var(--danger, #e03131)" />
      <Text size="sm" c="dimmed">
        {T.common.somethingWentWrong}
      </Text>
      <Button size="xs" variant="light" color="red" onClick={onRetry}>
        {T.common.retry}
      </Button>
    </Group>
  )
}
