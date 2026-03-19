// src/pages/Leaderboard.tsx
import { useEffect, useState } from 'react'
import { Container, Title, Tabs, Table, Text, Center, Loader, Badge, Group } from '@mantine/core'
import { leaderboardService, type LeaderboardEntry, type LeaderboardMetric } from '@/services/leaderboardService'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { IconClock, IconBook, IconVocabulary, IconCalendar } from '@tabler/icons-react'

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<string | null>('total_seconds_spent')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!activeTab) return
      setLoading(true)
      try {
        const data = await leaderboardService.getLeaderboard(activeTab as LeaderboardMetric)
        setEntries(data)
      } catch (err) {
        logError({ page: 'leaderboard', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to load leaderboard. Please try again.' })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [activeTab])

  const formatValue = (entry: LeaderboardEntry, metric: string) => {
    switch (metric) {
      case 'total_seconds_spent':
        const hours = Math.floor(entry.total_seconds_spent / 3600)
        const mins = Math.floor((entry.total_seconds_spent % 3600) / 60)
        return `${hours}h ${mins}m`
      case 'lessons_completed':
        return entry.lessons_completed
      case 'vocabulary_count':
        return entry.vocabulary_count
      case 'days_active':
        return `${entry.days_active} days`
      default:
        return 0
    }
  }

  const renderTable = () => (
    <Table mt="md" highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={60}>Rank</Table.Th>
          <Table.Th>User</Table.Th>
          <Table.Th>Level</Table.Th>
          <Table.Th ta="right">Value</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {entries.map((entry, index) => (
          <Table.Tr key={entry.user_id}>
            <Table.Td>
              <Group gap="xs">
                {index === 0 && '🥇'}
                {index === 1 && '🥈'}
                {index === 2 && '🥉'}
                {index > 2 && index + 1}
              </Group>
            </Table.Td>
            <Table.Td fw={500}>{entry.display_name || 'Anonymous'}</Table.Td>
            <Table.Td>
              <Badge variant="light" size="sm">{entry.current_level}</Badge>
            </Table.Td>
            <Table.Td ta="right" fw={700}>
              {formatValue(entry, activeTab!)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )

  return (
    <Container size="md" pt={14}>
      <Title order={1} mb="xl">Leaderboard</Title>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List grow>
          <Tabs.Tab value="total_seconds_spent" leftSection={<IconClock size={16} />}>
            Time Spent
          </Tabs.Tab>
          <Tabs.Tab value="lessons_completed" leftSection={<IconBook size={16} />}>
            Lessons
          </Tabs.Tab>
          <Tabs.Tab value="vocabulary_count" leftSection={<IconVocabulary size={16} />}>
            Words
          </Tabs.Tab>
          <Tabs.Tab value="days_active" leftSection={<IconCalendar size={16} />}>
            Consistency
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="total_seconds_spent">
          {loading ? <Center h="30vh"><Loader /></Center> : renderTable()}
        </Tabs.Panel>
        <Tabs.Panel value="lessons_completed">
          {loading ? <Center h="30vh"><Loader /></Center> : renderTable()}
        </Tabs.Panel>
        <Tabs.Panel value="vocabulary_count">
          {loading ? <Center h="30vh"><Loader /></Center> : renderTable()}
        </Tabs.Panel>
        <Tabs.Panel value="days_active">
          {loading ? <Center h="30vh"><Loader /></Center> : renderTable()}
        </Tabs.Panel>
      </Tabs>
      
      {!loading && entries.length === 0 && (
        <Center h="20vh">
          <Text c="dimmed">No entries found for this metric yet.</Text>
        </Center>
      )}
    </Container>
  )
}
