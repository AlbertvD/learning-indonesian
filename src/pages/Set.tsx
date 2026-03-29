// src/pages/Set.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Center, Loader, Text, Modal, TextInput, Stack, Group, Button, SegmentedControl, Badge } from '@mantine/core'
import { IconChevronLeft, IconShare, IconPlus, IconCards } from '@tabler/icons-react'
import { cardService } from '@/services/cardService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import { useT } from '@/hooks/useT'
import { ShareCardSetModal } from '@/components/ShareCardSetModal'
import type { AnkiCard, CardSet } from '@/types/cards'
import classes from './Set.module.css'

export function Set() {
  const { setId } = useParams<{ setId: string }>()
  const navigate = useNavigate()
  const T = useT()
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [set, setSet] = useState<CardSet | null>(null)
  const [cards, setCards] = useState<AnkiCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [studying, setStudying] = useState(false)
  const [shareModalOpened, setShareModalOpened] = useState(false)
  const [addCardOpened, setAddCardOpened] = useState(false)
  const [newFront, setNewFront] = useState('')
  const [newBack, setNewBack] = useState('')
  const [addingCard, setAddingCard] = useState(false)

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
        setError(true)
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
      await cardService.initializeCardReviews(cards.map(c => c.id), user.id, 'forward')
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

  const handleAddCard = async () => {
    if (!set || !newFront.trim() || !newBack.trim()) return
    setAddingCard(true)
    try {
      const card = await cardService.createCard(set.id, newFront.trim(), newBack.trim())
      setCards(prev => [...prev, card])
      setNewFront('')
      setNewBack('')
      setAddCardOpened(false)
      notifications.show({ color: 'green', title: T.sets.cardAdded, message: T.sets.cardAddedMsg })
    } catch (err) {
      logError({ page: 'set', action: 'addCard', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.sets.cardAddFailed })
    } finally {
      setAddingCard(false)
    }
  }

  if (loading) {
    return <Center h="50vh"><Loader size="xl" /></Center>
  }

  if (error || !set) {
    return (
      <Center h="50vh">
        <Text c="dimmed">Failed to load card set. <Button variant="subtle" onClick={() => navigate('/sets')}>Back to sets</Button></Text>
      </Center>
    )
  }

  const isOwner = user?.id === set.owner_id
  const isPublic = set.visibility === 'public'
  const lang = profile?.language ?? 'nl'
  const title = set.name.replace(/\s*\([^)]*\)/g, '')
  const description = set.description || T.sets.noDescription

  return (
    <Container size="lg" className={classes.page}>

      {/* ── Header nav ── */}
      <div className={classes.headerNav}>
        <button className={classes.backBtn} onClick={() => navigate('/sets')}>
          <IconChevronLeft size={15} />
          {T.sets.backToSets}
        </button>

        <div className={classes.headerCenter}>
          <div className={classes.headerTitle}>{title}</div>
          <div className={classes.headerDesc}>{description}</div>
        </div>

        <div className={classes.headerActions}>
          {isOwner && !isPublic && (
            <button className={classes.shareBtn} onClick={() => setShareModalOpened(true)}>
              <IconShare size={14} />
              {T.sets.share}
            </button>
          )}
          <button
            className={classes.studyBtn}
            onClick={handleStudy}
            disabled={cards.length === 0 || studying}
          >
            <IconCards size={14} />
            {T.sets.study}
          </button>
        </div>
      </div>

      {/* ── Visibility + card count ── */}
      <div className={classes.metaRow}>
        <span className={classes.cardCount}>{T.sets.cards(cards.length)}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isPublic && (
            <Badge size="sm" variant="light" color={set.visibility === 'shared' ? 'blue' : 'gray'}>
              {set.visibility === 'private' ? T.sets.private : set.visibility === 'shared' ? T.sets.shared : T.sets.public}
            </Badge>
          )}
          {isOwner && !isPublic && (
            <SegmentedControl
              size="xs"
              value={set.visibility}
              onChange={handleVisibilityChange}
              data={[
                { label: T.sets.private, value: 'private' },
                { label: T.sets.shared, value: 'shared' },
                { label: T.sets.public, value: 'public' },
              ]}
            />
          )}
        </div>
      </div>

      {/* ── Add card ── */}
      {isOwner && !isPublic && (
        <div className={classes.addCardRow}>
          <button className={classes.addBtn} onClick={() => setAddCardOpened(true)}>
            <IconPlus size={14} />
            {T.sets.addCard}
          </button>
        </div>
      )}

      {/* ── Vocab list ── */}
      {cards.length === 0 ? (
        <div className={classes.emptyState}>{T.sets.noCards}</div>
      ) : (
        <div className={classes.vocabList}>
          {cards.map((card) => {
            const translation = lang === 'nl' ? card.back : (card.notes ?? card.back)
            return (
              <div key={card.id} className={classes.vocabRow}>
                <div className={classes.vocabIndo}>
                  {card.front.replace(/\s*\([^)]*\)\s*$/, '')}
                </div>
                <div className={classes.vocabDutch}>
                  {translation || <span className={classes.vocabEmpty}>–</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modals ── */}
      <Modal
        opened={addCardOpened}
        onClose={() => { setAddCardOpened(false); setNewFront(''); setNewBack('') }}
        title={T.sets.addCardTitle}
      >
        <Stack gap="md">
          <TextInput
            label={T.sets.front}
            placeholder={T.sets.frontPlaceholder}
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
          />
          <TextInput
            label={T.sets.back}
            placeholder={T.sets.backPlaceholder}
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => { setAddCardOpened(false); setNewFront(''); setNewBack('') }}>{T.sets.cancel}</Button>
            <Button onClick={handleAddCard} loading={addingCard} disabled={!newFront.trim() || !newBack.trim()}>{T.sets.addCard}</Button>
          </Group>
        </Stack>
      </Modal>

      <ShareCardSetModal
        opened={shareModalOpened}
        onClose={() => setShareModalOpened(false)}
        setId={set.id}
        setName={set.name}
      />
    </Container>
  )
}
