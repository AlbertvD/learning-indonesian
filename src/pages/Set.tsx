// src/pages/Set.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Title, Text, Button, Group, Badge, SegmentedControl, Paper, Stack, Center, Loader, Table } from '@mantine/core'
import { IconChevronLeft, IconShare, IconPlus, IconCards } from '@tabler/icons-react'
import { cardService } from '@/services/cardService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { ShareCardSetModal } from '@/components/ShareCardSetModal'
import type { AnkiCard, CardSet } from '@/types/cards'

export function Set() {
  const { setId } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  
  const [set, setSet] = useState<CardSet | null>(null)
  const [cards, setCards] = useState<AnkiCard[]>([])
  const [loading, setLoading] = useState(true)
  const [studying, setStudying] = useState(false)
  const [shareModalOpened, setShareModalOpened] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!setId) return
      try {
        const [sets, fetchedCards] = await Promise.all([
          cardService.getCardSets(),
          cardService.getCards(setId),
        ])
        const currentSet = sets.find(s => s.id === setId)
        if (currentSet) {
          setSet(currentSet)
          setCards(fetchedCards)
        } else {
          notifications.show({ color: 'red', title: 'Error', message: 'Card set not found or access denied' })
          navigate('/sets')
        }
      } catch (err) {
        logError({ page: 'set', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: 'Error', message: 'Failed to load card set' })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [setId])

  const handleStudy = async () => {
    if (!user || cards.length === 0) return
    setStudying(true)
    try {
      await cardService.initializeCardReviews(cards.map(c => c.id), user.id)
      navigate('/review')
    } catch (err) {
      logError({ page: 'set', action: 'study', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to start study session. Please try again.' })
      setStudying(false)
    }
  }

  const handleVisibilityChange = async (value: string) => {
    if (!set || !user || set.owner_id !== user.id) return
    const newVisibility = value as 'private' | 'shared' | 'public'
    try {
      await cardService.updateCardSetVisibility(set.id, newVisibility)
      setSet({ ...set, visibility: newVisibility })
      notifications.show({ color: 'green', title: 'Success', message: `Visibility updated to ${newVisibility}` })
    } catch (err) {
      logError({ page: 'set', action: 'updateVisibility', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to update visibility' })
    }
  }

  if (loading || !set) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const isOwner = user?.id === set.owner_id
  const isPublic = set.visibility === 'public'

  return (
    <Container size="lg">
      <Stack gap="xl">
        <Group justify="space-between">
          <Button variant="subtle" color="gray" leftSection={<IconChevronLeft size={16} />} onClick={() => navigate('/sets')}>
            Back to sets
          </Button>
          <Group gap="sm">
            {isOwner && !isPublic && (
              <Button variant="light" leftSection={<IconShare size={16} />} onClick={() => setShareModalOpened(true)}>
                Share
              </Button>
            )}
            <Button
              leftSection={<IconCards size={16} />}
              onClick={handleStudy}
              loading={studying}
              disabled={cards.length === 0}
            >
              Study
            </Button>
          </Group>
        </Group>

        <Paper withBorder p="xl" radius="md">
          <Group justify="space-between" mb="md" align="flex-start">
            <div>
              <Title order={2}>{set.name}</Title>
              <Text c="dimmed" mt="xs">{set.description || 'No description provided.'}</Text>
            </div>
            {!isPublic && (
              <Badge size="lg" variant="light" color={set.visibility === 'shared' ? 'blue' : 'gray'}>
                {set.visibility}
              </Badge>
            )}
          </Group>

          {isOwner && !isPublic && (
            <Group mt="xl">
              <Text size="sm" fw={500}>Set Visibility:</Text>
              <SegmentedControl
                value={set.visibility}
                onChange={handleVisibilityChange}
                data={[
                  { label: 'Private', value: 'private' },
                  { label: 'Shared', value: 'shared' },
                  { label: 'Public', value: 'public' },
                ]}
              />
            </Group>
          )}
        </Paper>

        <Group justify="space-between">
          <Title order={3}>Cards ({cards.length})</Title>
          {isOwner && !isPublic && (
            <Button leftSection={<IconPlus size={16} />} variant="outline">Add Card</Button>
          )}
        </Group>

        {cards.length === 0 ? (
          <Center h={100} style={{ border: '1px dashed #373A40', borderRadius: '8px' }}>
            <Text c="dimmed">No cards in this set yet.</Text>
          </Center>
        ) : (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Indonesisch</Table.Th>
                <Table.Th>Nederlands</Table.Th>
                {cards.some(c => c.notes) && <Table.Th>Engels</Table.Th>}
                {cards.some(c => c.tags?.length > 0) && <Table.Th>Tags</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cards.map((card) => (
                <Table.Tr key={card.id}>
                  <Table.Td fw={500}>{card.front}</Table.Td>
                  <Table.Td>{card.back}</Table.Td>
                  {cards.some(c => c.notes) && (
                    <Table.Td c="dimmed">{card.notes ?? ''}</Table.Td>
                  )}
                  {cards.some(c => c.tags?.length > 0) && (
                    <Table.Td>
                      <Group gap={4}>
                        {card.tags?.map(tag => (
                          <Badge key={tag} size="xs" variant="light">{tag}</Badge>
                        ))}
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <ShareCardSetModal
        opened={shareModalOpened}
        onClose={() => setShareModalOpened(false)}
        setId={set.id}
        setName={set.name}
      />
    </Container>
  )
}
