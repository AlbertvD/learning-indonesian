import { Alert } from '@mantine/core'
import { IconCalendarClock } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'

interface Props {
  ageDays: number | null
}

export function RecencyBadge({ ageDays }: Props) {
  const T = useT()
  if (ageDays === null || ageDays <= 2) return null
  const template = ageDays === 1
    ? T.dashboard.recencyBadge.messageSingular
    : T.dashboard.recencyBadge.message
  const message = template.replace('{days}', String(ageDays))
  return (
    <Alert
      color="blue"
      variant="light"
      icon={<IconCalendarClock size={18} />}
      data-testid="recency-badge"
    >
      {message}
    </Alert>
  )
}
