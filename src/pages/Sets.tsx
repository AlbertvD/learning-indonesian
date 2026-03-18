// src/pages/Sets.tsx
import { useEffect, useState } from 'react'
import { Container, Title, Text, Card, Group, Badge, SimpleGrid, Button, Modal, TextInput, Textarea, Loader, Center, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link } from 'react-router-dom'
import { useCardStore } from '@/stores/cardStore'
import { useAuthStore } from '@/stores/authStore'
import { IconPlus, IconCards } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'

export function Sets() {
  const { cardSets, fetchCardSets, addCardSet, loading } = useCardStore()
  const user = useAuthStore((state) => state.user)
  const [modalOpened, setModalOpened] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchCardSets()
  }, [])

  const form = useForm({
    initialValues: {
      name: '',
      description: '',
    },
    validate: {
      name: (value) => (value.length < 2 ? 'Name is too short' : null),
    },
  })

  const handleCreate = async (values: typeof form.values) => {
    if (!user) return
    setCreating(true)
    try {
      await addCardSet(values.name, values.description, user.id)
      notifications.show({ color: 'green', title: 'Success', message: 'Card set created' })
      setModalOpened(false)
      form.reset()
    } catch (err) {
      logError({ page: 'sets', action: 'createCardSet', error: err })
      notifications.show({ color: 'red', title: 'Error', message: 'Failed to create card set' })
    } finally {
      setCreating(false)
    }
  }

  const getVisibilityColor = (v: string) => {
    switch (v) {
      case 'public': return 'green'
      case 'shared': return 'blue'
      default: return 'gray'
    }
  }

  return (
    <Container size="lg">
      <Group justify="space-between" mb="xl">
        <Title order={1}>Card Sets</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpened(true)}>
          Create new set
        </Button>
      </Group>

      {loading && cardSets.length === 0 ? (
        <Center h="30vh"><Loader /></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {cardSets.map((set) => (
            <Card
              key={set.id}
              shadow="sm"
              padding="lg"
              radius="md"
              withBorder
              component={Link}
              to={`/sets/${set.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Group justify="space-between" mb="xs">
                <Text fw={700}>{set.name}</Text>
                {set.visibility !== 'public' && (
                  <Badge color={getVisibilityColor(set.visibility)} variant="light" size="xs">
                    {set.visibility}
                  </Badge>
                )}
              </Group>

              <Text size="sm" c="dimmed" lineClamp={2} mb="md">
                {set.description || 'No description provided.'}
              </Text>

              <Group gap="xs" mt="auto">
                <IconCards size={14} color="gray" />
                <Text size="xs" c="dimmed">Owner: {set.owner_id === user?.id ? 'You' : 'Others'}</Text>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {cardSets.length === 0 && !loading && (
        <Center h="20vh">
          <Stack align="center" gap="xs">
            <Text c="dimmed">No card sets found.</Text>
            <Button variant="subtle" size="sm" onClick={() => setModalOpened(true)}>Create your first set</Button>
          </Stack>
        </Center>
      )}

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Create New Card Set">
        <form onSubmit={form.onSubmit(handleCreate)}>
          <TextInput
            label="Name"
            placeholder="Common phrases"
            required
            {...form.getInputProps('name')}
          />
          <Textarea
            label="Description"
            placeholder="Basic vocabulary for daily life"
            mt="md"
            {...form.getInputProps('description')}
          />
          <Button fullWidth mt="xl" type="submit" loading={creating}>
            Create Set
          </Button>
        </form>
      </Modal>
    </Container>
  )
}
