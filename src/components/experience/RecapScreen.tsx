import { Stack, Button, Text, Group, SimpleGrid } from '@mantine/core'
import { HeroCard } from '@/components/page/primitives'
import { capabilityDisplay } from '@/lib/session-builder'
import type { SessionBlock } from '@/lib/session-builder'
import { translations } from '@/lib/i18n'

interface RecapScreenProps {
  renderableBlocks: SessionBlock[]
  answeredBlocks: Set<string>
  skippedBlocks: Set<string>
  commitFailedBlocks: Set<string>
  // Leave the recap (navigate home). Completion is recorded by the player when
  // the cards run out, not here — so this is navigation only.
  onExit: () => void
  userLanguage: 'nl' | 'en'
}

export function RecapScreen({
  renderableBlocks,
  answeredBlocks,
  skippedBlocks,
  commitFailedBlocks,
  onExit,
  userLanguage,
}: RecapScreenProps) {
  const T = translations[userLanguage]

  if (renderableBlocks.length === 0) {
    return (
      <Stack gap="md" data-testid="session-recap">
        <HeroCard title={T.recap.emptyTitle}>
          <Text>{T.recap.emptyMessage}</Text>
        </HeroCard>
        <Button onClick={onExit} fullWidth>
          {T.recap.backToDashboard}
        </Button>
      </Stack>
    )
  }

  const effectiveTotal = renderableBlocks.length
  const effectiveDueCount = renderableBlocks.filter(b => b.kind === 'due_review').length
  const effectiveNewCount = renderableBlocks.filter(b => b.kind === 'new_introduction').length

  const savedBlocks = renderableBlocks.filter(
    b => answeredBlocks.has(b.id) && !skippedBlocks.has(b.id) && !commitFailedBlocks.has(b.id),
  )
  const savedCount = savedBlocks.length
  const savedDue = savedBlocks.filter(b => b.kind === 'due_review').length
  const savedNew = savedBlocks.filter(b => b.kind === 'new_introduction').length
  const notTouched = Math.max(effectiveTotal - answeredBlocks.size, 0)

  const failedCount = commitFailedBlocks.size

  return (
    <Stack gap="md" data-testid="session-recap">
      <HeroCard title={T.recap.completedTitle}>
        <Stack gap="xs">
          <Text>
            {T.recap.savedSummary(savedCount, effectiveTotal)}
          </Text>
          {failedCount === 1 && (
            <Text c="dimmed" size="sm">
              {T.recap.failedSingular}
            </Text>
          )}
          {failedCount >= 2 && (
            <Text c="dimmed" size="sm">
              {T.recap.failedPlural(failedCount)}
            </Text>
          )}
        </Stack>
      </HeroCard>

      <SimpleGrid cols={3}>
        <Group gap="xs" justify="center">
          <Text fw={700}>{savedDue}/{effectiveDueCount}</Text>
          <Text size="sm" c="dimmed">{T.recap.reviewed}</Text>
        </Group>
        <Group gap="xs" justify="center">
          <Text fw={700}>{savedNew}/{effectiveNewCount}</Text>
          <Text size="sm" c="dimmed">{T.recap.introduced}</Text>
        </Group>
        <Group gap="xs" justify="center">
          <Text fw={700}>{notTouched}</Text>
          <Text size="sm" c="dimmed">{T.recap.notTouched}</Text>
        </Group>
      </SimpleGrid>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {renderableBlocks.map(b => {
          const kicker = commitFailedBlocks.has(b.id)
            ? T.recap.kickerNotSaved
            : skippedBlocks.has(b.id)
              ? T.recap.kickerSkipped
              : b.kind === 'due_review'
                ? T.recap.kickerReviewSaved
                : T.recap.kickerIntroStarted
          return (
            <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <Text size="sm" c="dimmed">{kicker}</Text>
              <Text size="sm" fw={500}>{capabilityDisplay(b.renderPlan.capabilityType).label}</Text>
            </li>
          )
        })}
      </ul>

      <Button onClick={onExit} fullWidth>
        {T.recap.backToDashboard}
      </Button>
    </Stack>
  )
}
