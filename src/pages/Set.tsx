// src/pages/Set.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Title, Text, Button, Group, Badge, SegmentedControl, Paper, Stack, Center, Loader, Table } from '@mantine/core'
import { IconChevronLeft, IconShare, IconPlus, IconCards } from '@tabler/icons-react'
import { cardService } from '@/services/cardService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { ShareCardSetModal } from '@/components/ShareCardSetModal'
import type { AnkiCard, CardSet } from '@/types/cards'

export function Set() {
  const { setId } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

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
          notifications.show({ color: 'red', title: T.common.error, message: T.sets.notFound })
          navigate('/sets')
        }
      } catch (err) {
        logError({ page: 'set', action: 'fetchData', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.sets.failedToLoad })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [setId, navigate, T.common.error, T.sets.notFound, T.sets.failedToLoad])

  const handleStudy = async () => {
    if (!user || cards.length === 0) return
    setStudying(true)
    try {
      await cardService.initializeCardReviews(cards.map(c => c.id), user.id)
      navigate('/review')
    } catch (err) {
      logError({ page: 'set', action: 'study', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.sets.failedToStudy })
      setStudying(false)
    }
  }

  const handleVisibilityChange = async (value: string) => {
    if (!set || !user || set.owner_id !== user.id) return
    const newVisibility = value as 'private' | 'shared' | 'public'
    try {
      await cardService.updateCardSetVisibility(set.id, newVisibility)
      setSet({ ...set, visibility: newVisibility })
      notifications.show({ color: 'green', title: T.sets.shared, message: T.sets.visibilityUpdated(newVisibility) })
    } catch (err) {
      logError({ page: 'set', action: 'updateVisibility', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.sets.failedToUpdateVisibility })
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
  const lang = profile?.language ?? 'nl'

  return (
    <Container size="lg">
      <Stack gap="xl">
        <Group justify="space-between">
          <Button variant="subtle" color="gray" leftSection={<IconChevronLeft size={16} />} onClick={() => navigate('/sets')}>
            {T.sets.backToSets}
          </Button>
          <Group gap="sm">
            {isOwner && !isPublic && (
              <Button variant="light" leftSection={<IconShare size={16} />} onClick={() => setShareModalOpened(true)}>
                {T.sets.share}
              </Button>
            )}
            <Button
              leftSection={<IconCards size={16} />}
              onClick={handleStudy}
              loading={studying}
              disabled={cards.length === 0}
            >
              {T.sets.study}
            </Button>
          </Group>
        </Group>

        <Paper withBorder p="xl" radius="md">
          <Group justify="space-between" mb="md" align="flex-start">
            <div>
              <Title order={2}>{set.name}</Title>
              <Text c="dimmed" mt="xs">{set.description || T.sets.noDescription}</Text>
            </div>
            {!isPublic && (
              <Badge size="lg" variant="light" color={set.visibility === 'shared' ? 'blue' : 'gray'}>
                {set.visibility === 'private' ? T.sets.private : set.visibility === 'shared' ? T.sets.shared : T.sets.public}
              </Badge>
            )}
          </Group>

          {isOwner && !isPublic && (
            <Group mt="xl">
              <Text size="sm" fw={500}>{T.sets.setVisibility}</Text>
              <SegmentedControl
                value={set.visibility}
                onChange={handleVisibilityChange}
                data={[
                  { label: T.sets.private, value: 'private' },
                  { label: T.sets.shared, value: 'shared' },
                  { label: T.sets.public, value: 'public' },
                ]}
              />
            </Group>
          )}
        </Paper>

        <Group justify="space-between">
          <Title order={3}>{T.sets.cards(cards.length)}</Title>
          {isOwner && !isPublic && (
            <Button leftSection={<IconPlus size={16} />} variant="outline">{T.sets.addCard}</Button>
          )}
        </Group>

        {cards.length === 0 ? (
          <Center h={100} style={{ border: '1px dashed #373A40', borderRadius: '8px' }}>
            <Text c="dimmed">{T.sets.noCards}</Text>
          </Center>
        ) : (
          <Table striped highlightOnHover withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ textAlign: 'left' }}>{T.sets.indonesian}</Table.Th>
                <Table.Th style={{ textAlign: 'left' }}>
                  {lang === 'nl' ? T.sets.dutch : T.sets.english}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cards.map((card) => (
                <Table.Tr key={card.id}>
                  <Table.Td fw={500} style={{ textAlign: 'left' }}>{card.front.replace(/\s*\([^)]*\)\s*$/, '')}</Table.Td>
                  <Table.Td style={{ textAlign: 'left' }}>
                    {lang === 'nl' ? card.back : (card.notes ?? card.back)}
                  </Table.Td>
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
