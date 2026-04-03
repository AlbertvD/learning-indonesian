import { Box, Container, Stack, Text, Button, Group, Badge, ThemeIcon, rem } from '@mantine/core'
import { IconCheck, IconTrendingUp } from '@tabler/icons-react'
import classes from './SessionSummary.module.css'

interface SessionSummaryProps {
  results: {
    correct: number
    total: number
  }
  goalImpactMessages?: {
    sessionLocalFacts: string[]
    weeklyImpactChanges: string[]
  }
  onComplete: () => void
}

export function SessionSummary({ results, goalImpactMessages, onComplete }: SessionSummaryProps) {
  const percentage = Math.round((results.correct / results.total) * 100)

  return (
    <Container size="sm" py="xl">
      <Box className={classes.container}>
        <Stack align="center" gap="lg">
          <IconCheck size={64} color="green" strokeWidth={1.5} />

          <div>
            <Text size="lg" fw={500}>
              Session Complete!
            </Text>
            <Text c="dimmed" mt="xs">
              Great job on your practice session.
            </Text>
          </div>

          <Group gap="xl" justify="center">
            <Box style={{ textAlign: 'center' }}>
              <Text size="xl" fw={700} c="green">
                {results.correct}
              </Text>
              <Text size="sm" c="dimmed">
                Correct
              </Text>
            </Box>
            <Box style={{ textAlign: 'center' }}>
              <Text size="xl" fw={700} c="orange">
                {results.total - results.correct}
              </Text>
              <Text size="sm" c="dimmed">
                To review
              </Text>
            </Box>
            <Box style={{ textAlign: 'center' }}>
              <Text size="xl" fw={700} c="blue">
                {percentage}%
              </Text>
              <Text size="sm" c="dimmed">
                Accuracy
              </Text>
            </Box>
          </Group>

          <Badge size="lg" color={percentage >= 70 ? 'green' : percentage >= 50 ? 'yellow' : 'red'}>
            {percentage >= 70 ? 'Excellent' : percentage >= 50 ? 'Good' : 'Keep practicing'}
          </Badge>

          {/* Goal Impact Messages */}
          {goalImpactMessages && (
            <Stack gap="md" w="100%" style={{ borderTop: '1px solid var(--mantine-color-gray-3)', paddingTop: 'var(--mantine-spacing-md)' }}>
              {/* Session-local facts */}
              {goalImpactMessages.sessionLocalFacts.length > 0 && (
                <Stack gap="xs">
                  {goalImpactMessages.sessionLocalFacts.map((fact, idx) => (
                    <Group key={idx} gap="sm">
                      <ThemeIcon size="sm" radius="xl" variant="light" color="blue">
                        <IconTrendingUp style={{ width: rem(14), height: rem(14) }} />
                      </ThemeIcon>
                      <Text size="sm">{fact}</Text>
                    </Group>
                  ))}
                </Stack>
              )}

              {/* Weekly goal impact changes */}
              {goalImpactMessages.weeklyImpactChanges.length > 0 && (
                <Stack gap="xs">
                  {goalImpactMessages.weeklyImpactChanges.map((change, idx) => (
                    <Group key={idx} gap="sm">
                      <ThemeIcon size="sm" radius="xl" variant="light" color="cyan">
                        <IconTrendingUp style={{ width: rem(14), height: rem(14) }} />
                      </ThemeIcon>
                      <Text size="sm">{change}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          )}

          <Button onClick={onComplete} size="lg" fullWidth>
            Continue
          </Button>
        </Stack>
      </Box>
    </Container>
  )
}
