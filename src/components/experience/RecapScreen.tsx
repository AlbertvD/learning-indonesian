import { Stack, Button, Text, Group, SimpleGrid } from '@mantine/core'
import { HeroCard } from '@/components/page/primitives'
import { capabilityDisplay } from '@/lib/session-builder'
import type { SessionBlock } from '@/lib/session-builder'

interface RecapScreenProps {
  renderableBlocks: SessionBlock[]
  answeredBlocks: Set<string>
  skippedBlocks: Set<string>
  commitFailedBlocks: Set<string>
  onComplete: () => void
}

export function RecapScreen({
  renderableBlocks,
  answeredBlocks,
  skippedBlocks,
  commitFailedBlocks,
  onComplete,
}: RecapScreenProps) {
  if (renderableBlocks.length === 0) {
    return (
      <Stack gap="md">
        <HeroCard title="Niets te doen">
          <Text>Er zijn geen kaarten beschikbaar voor deze sessie.</Text>
        </HeroCard>
        <Button onClick={onComplete} fullWidth>
          Terug naar dashboard
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
    <Stack gap="md">
      <HeroCard title="Sessieroute afgerond">
        <Stack gap="xs">
          <Text>
            {savedCount} van {effectiveTotal} vaardigheidskaarten zijn veilig opgeslagen.
          </Text>
          {failedCount === 1 && (
            <Text c="dimmed" size="sm">
              1 antwoord kon niet worden opgeslagen — we proberen het later opnieuw.
            </Text>
          )}
          {failedCount >= 2 && (
            <Text c="dimmed" size="sm">
              {failedCount} antwoorden konden niet worden opgeslagen — we proberen ze later opnieuw.
            </Text>
          )}
        </Stack>
      </HeroCard>

      <SimpleGrid cols={3}>
        <Group gap="xs" justify="center">
          <Text fw={700}>{savedDue}/{effectiveDueCount}</Text>
          <Text size="sm" c="dimmed">herhaald</Text>
        </Group>
        <Group gap="xs" justify="center">
          <Text fw={700}>{savedNew}/{effectiveNewCount}</Text>
          <Text size="sm" c="dimmed">geïntroduceerd</Text>
        </Group>
        <Group gap="xs" justify="center">
          <Text fw={700}>{notTouched}</Text>
          <Text size="sm" c="dimmed">niet aangeraakt</Text>
        </Group>
      </SimpleGrid>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {renderableBlocks.map(b => {
          const kicker = commitFailedBlocks.has(b.id)
            ? 'Niet opgeslagen'
            : skippedBlocks.has(b.id)
              ? 'Overgeslagen'
              : b.kind === 'due_review'
                ? 'Herhaling opgeslagen'
                : 'Introductie gestart'
          return (
            <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <Text size="sm" c="dimmed">{kicker}</Text>
              <Text size="sm" fw={500}>{capabilityDisplay(b.renderPlan.capabilityType).label}</Text>
            </li>
          )
        })}
      </ul>

      <Button onClick={onComplete} fullWidth>
        Terug naar dashboard
      </Button>
    </Stack>
  )
}
