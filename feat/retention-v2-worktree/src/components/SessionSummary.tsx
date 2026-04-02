import { Box, Container, Stack, Text, Button, Group, Badge } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import classes from './SessionSummary.module.css'

interface SessionSummaryProps {
  results: {
    correct: number
    total: number
  }
  onComplete: () => void
}

export function SessionSummary({ results, onComplete }: SessionSummaryProps) {
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

          <Button onClick={onComplete} size="lg" fullWidth>
            Continue
          </Button>
        </Stack>
      </Box>
    </Container>
  )
}
