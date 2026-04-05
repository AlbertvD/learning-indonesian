import { Badge, Paper, Progress, Skeleton, Text } from '@mantine/core'
import { IconAlertCircle } from '@tabler/icons-react'
import classes from './VulnerableItemsList.module.css'

interface VulnerableItemsListProps {
  items: { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[] | null
  loading: boolean
}

function getProgressColor(strength: number): string {
  if (strength < 40) return 'red'
  if (strength <= 60) return 'orange'
  return 'cyan'
}

export function VulnerableItemsList({ items, loading }: VulnerableItemsListProps) {
  return (
    <div>
      <Text fw={600} size="sm" mb={2}>
        Kwetsbare Woorden
      </Text>
      <Text c="dimmed" size="xs" mb="sm">
        Woorden die de meeste aandacht nodig hebben
      </Text>

      {loading && (
        <>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={36} mb="xs" />
          ))}
        </>
      )}

      {!loading && items === null && (
        <Text c="dimmed" size="sm">
          Kon kwetsbare woorden niet laden.
        </Text>
      )}

      {!loading && items !== null && items.length === 0 && (
        <Text c="dimmed" size="sm">
          Geen kwetsbare woorden — goed gedaan! 🎉
        </Text>
      )}

      {!loading && items !== null && items.length > 0 && (
        <>
          {items.slice(0, 5).map((item) => {
            const strength = Math.max(0, 100 - item.lapseCount * 20)
            const progressColor = getProgressColor(strength)
            const lapseBadgeColor = item.lapseCount > 2 ? 'red' : 'orange'

            return (
              <Paper key={item.id} withBorder p="sm" mb="xs">
                <div className={classes.row}>
                  <Text fw={700} ff="monospace" size="sm" className={classes.word}>
                    {item.indonesianText}
                  </Text>

                  <div className={classes.badges}>
                    <Badge color={lapseBadgeColor} size="sm">
                      {item.lapseCount}x
                    </Badge>

                    {item.consecutiveFailures > 0 && (
                      <Badge color="red" variant="dot" size="sm" leftSection={
                        <IconAlertCircle size={14} />
                      }>
                        !
                      </Badge>
                    )}
                  </div>

                  <div className={classes.progressWrapper}>
                    <Progress value={strength} color={progressColor} size="xs" />
                  </div>
                </div>
              </Paper>
            )
          })}
        </>
      )}
    </div>
  )
}
