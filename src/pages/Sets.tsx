// src/pages/Sets.tsx
import { useEffect, useState } from 'react'
import { Container, Modal, TextInput, Textarea, Loader, Center, Stack } from '@mantine/core'
import { useForm } from '@mantine/form'
import { Link } from 'react-router-dom'
import { useCardStore } from '@/stores/cardStore'
import { useAuthStore } from '@/stores/authStore'
import { IconPlus, IconChevronRight, IconCards } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'
import classes from './Sets.module.css'

export function Sets() {
  const T = useT()
  const { cardSets, fetchCardSets, addCardSet, loading } = useCardStore()
  const user = useAuthStore((state) => state.user)
  const [modalOpened, setModalOpened] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchCardSets()
  }, [fetchCardSets])

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
      notifications.show({ color: 'green', title: T.sets.created, message: T.sets.createSuccess })
      setModalOpened(false)
      form.reset()
    } catch (err) {
      logError({ page: 'sets', action: 'createCardSet', error: err })
      notifications.show({ color: 'red', title: T.sets.createFailed, message: T.sets.createError })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Container size="lg" className={classes.sets}>
      <div className={classes.header}>
        <div className={classes.displaySm}>Card Sets</div>
        <button className={classes.btn} onClick={() => setModalOpened(true)}>
          <IconPlus size={15} />
          Create set
        </button>
      </div>

      {loading && cardSets.length === 0 ? (
        <Center h="30vh"><Loader color="violet" /></Center>
      ) : (
        <div className={classes.setGrid}>
          {cardSets.map((set) => (
            <Link key={set.id} to={`/sets/${set.id}`} className={classes.setCard}>
              <div className={classes.setIcon}>
                <IconCards size={16} />
              </div>
              <div className={classes.setInfo}>
                <div className={classes.setName}>{set.name}</div>
              </div>
              <span className={classes.setArrow}><IconChevronRight size={15} /></span>
            </Link>
          ))}
        </div>
      )}

      {cardSets.length === 0 && !loading && (
        <Center h="20vh">
          <Stack align="center" gap="xs">
            <div className={classes.setDescription}>No card sets found.</div>
            <button className={classes.btn} onClick={() => setModalOpened(true)}>Create your first set</button>
          </Stack>
        </Center>
      )}

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Create New Card Set" radius="lg">
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
          <button className={classes.btn} style={{ width: '100%', marginTop: 24, height: 44 }} type="submit" disabled={creating}>
            {creating ? 'Creating...' : 'Create Set'}
          </button>
        </form>
      </Modal>
    </Container>
  )
}
