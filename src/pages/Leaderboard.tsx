// src/pages/Leaderboard.tsx
import { useEffect, useState } from 'react'
import { Tabs, Table, Group } from '@mantine/core'
import { IconClock, IconBook, IconVocabulary, IconCalendar, IconTrophy } from '@tabler/icons-react'
import {
  PageContainer,
  PageBody,
  PageHeader,
  LoadingState,
  EmptyState,
} from '@/components/page/primitives'
import { leaderboardService } from '@/services/leaderboardService'
import type { LeaderboardEntry, LeaderboardMetric } from '@/types/learning'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'

export function Leaderboard() {
  const T = useT()
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
        notifications.show({ color: 'red', title: T.common.error, message: T.leaderboard.failedToLoad })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [activeTab, T.common.error, T.leaderboard.failedToLoad])

  const formatValue = (entry: LeaderboardEntry, metric: string) => {
    switch (metric) {
      case 'total_seconds_spent': {
        const hours = Math.floor(entry.total_seconds_spent / 3600)
        const mins = Math.floor((entry.total_seconds_spent % 3600) / 60)
        return `${hours}${T.leaderboard.hours} ${mins}m`
      }
      case 'lessons_completed':
        return entry.lessons_completed
      case 'items_learned':
        return entry.items_learned
      case 'days_active':
        return `${entry.days_active} ${T.leaderboard.days}`
      default:
        return 0
    }
  }

  const renderTable = () => (
    <Table mt="md" highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={60}>{T.leaderboard.rank}</Table.Th>
          <Table.Th>{T.leaderboard.user}</Table.Th>
          <Table.Th ta="right">{T.leaderboard.value}</Table.Th>
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
            <Table.Td fw={500}>{entry.display_name || T.leaderboard.anonymous}</Table.Td>
            <Table.Td ta="right" fw={700}>
              {formatValue(entry, activeTab ?? 'total_seconds_spent')}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )

  const renderTabContent = () => {
    if (loading) return <LoadingState />
    if (entries.length === 0) {
      return <EmptyState icon={<IconTrophy size={48} />} message={T.leaderboard.noEntries} />
    }
    return renderTable()
  }

  return (
    <PageContainer size="lg">
      <PageBody>
        <PageHeader title={T.leaderboard.title} />

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List grow>
            <Tabs.Tab value="total_seconds_spent" leftSection={<IconClock size={16} />}>
              {T.leaderboard.timeSpent}
            </Tabs.Tab>
            <Tabs.Tab value="lessons_completed" leftSection={<IconBook size={16} />}>
              {T.leaderboard.lessons}
            </Tabs.Tab>
            <Tabs.Tab value="items_learned" leftSection={<IconVocabulary size={16} />}>
              {T.leaderboard.words}
            </Tabs.Tab>
            <Tabs.Tab value="days_active" leftSection={<IconCalendar size={16} />}>
              {T.leaderboard.consistency}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="total_seconds_spent">{renderTabContent()}</Tabs.Panel>
          <Tabs.Panel value="lessons_completed">{renderTabContent()}</Tabs.Panel>
          <Tabs.Panel value="items_learned">{renderTabContent()}</Tabs.Panel>
          <Tabs.Panel value="days_active">{renderTabContent()}</Tabs.Panel>
        </Tabs>
      </PageBody>
    </PageContainer>
  )
}
