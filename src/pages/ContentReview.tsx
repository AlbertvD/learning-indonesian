import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container, Title, Group, Select, Text, Tabs, Stack,
  Textarea, Button, Box, Center, Loader, Badge,
} from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconCheck } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { exerciseReviewService } from '@/services/exerciseReviewService'
import { logError } from '@/lib/logger'
import { ExerciseSummaryCard } from '@/components/admin/ExerciseSummaryCard'
import { ContrastPairExercise } from '@/components/exercises/ContrastPairExercise'
import { ClozeMcq } from '@/components/exercises/ClozeMcq'
import { SentenceTransformationExercise } from '@/components/exercises/SentenceTransformationExercise'
import { ConstrainedTranslationExercise } from '@/components/exercises/ConstrainedTranslationExercise'
import type { ExerciseVariant, ReviewComment, ReviewCommentWithContext } from '@/types/learning'

interface Lesson { id: string; title: string; order_index: number }

export function ContentReview() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()

  useEffect(() => {
    if (profile && !profile.isAdmin) navigate('/', { replace: true })
  }, [profile, navigate])

  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [variants, setVariants] = useState<ExerciseVariant[]>([])
  const [commentMap, setCommentMap] = useState<Map<string, ReviewComment>>(new Map())
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [draftComment, setDraftComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [openComments, setOpenComments] = useState<ReviewCommentWithContext[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)

  useEffect(() => {
    supabase.schema('indonesian').from('lessons').select('id, title, order_index').order('order_index')
      .then(({ data, error }) => {
        if (error) { logError({ page: 'content-review', action: 'loadLessons', error }); return }
        setLessons(data ?? [])
      })
  }, [])

  useEffect(() => {
    if (!selectedLessonId) { setVariants([]); return }
    setLoading(true)
    setIndex(0)
    setSelectedType(null)
    exerciseReviewService.getVariantsForLesson(selectedLessonId)
      .then(async (vars) => {
        setVariants(vars)
        if (vars.length > 0 && user) {
          const map = await exerciseReviewService.getCommentsForVariants(user.id, vars.map(v => v.id))
          setCommentMap(map)
        }
      })
      .catch(err => {
        logError({ page: 'content-review', action: 'loadVariants', error: err })
        notifications.show({ color: 'red', title: 'Fout', message: 'Oefeningen laden mislukt.' })
      })
      .finally(() => setLoading(false))
  }, [selectedLessonId, user])

  useEffect(() => { setIndex(0) }, [selectedType])

  const filteredVariants = selectedType
    ? variants.filter(v => v.exercise_type === selectedType)
    : variants

  const current = filteredVariants[index] ?? null

  useEffect(() => {
    if (!current) { setDraftComment(''); return }
    setDraftComment(commentMap.get(current.id)?.comment ?? '')
  }, [current?.id, commentMap])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (document.activeElement?.tagName === 'TEXTAREA') return
    if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1))
    if (e.key === 'ArrowRight') setIndex(i => Math.min(filteredVariants.length - 1, i + 1))
  }, [filteredVariants.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleSaveComment = async () => {
    if (!current || !user || !draftComment.trim()) return
    setSaving(true)
    try {
      const saved = await exerciseReviewService.upsertComment(user.id, current.id, draftComment.trim())
      setCommentMap(m => new Map(m).set(current.id, saved))
      setSavedId(current.id)
      setTimeout(() => setSavedId(null), 2500)
      notifications.show({ color: 'green', title: 'Opgeslagen', message: 'Opmerking opgeslagen.' })
    } catch (err) {
      logError({ page: 'content-review', action: 'saveComment', error: err })
      notifications.show({ color: 'red', title: 'Fout', message: 'Opslaan mislukt.' })
    } finally {
      setSaving(false)
    }
  }

  const loadOpenComments = useCallback(async () => {
    if (!user) return
    setCommentsLoading(true)
    try {
      setOpenComments(await exerciseReviewService.getOpenComments(user.id))
    } catch (err) {
      logError({ page: 'content-review', action: 'loadOpenComments', error: err })
      notifications.show({ color: 'red', title: 'Fout', message: 'Opmerkingen laden mislukt.' })
    } finally {
      setCommentsLoading(false)
    }
  }, [user])

  const handleResolve = async (commentId: string) => {
    try {
      await exerciseReviewService.resolveComment(commentId)
      setOpenComments(cs => cs.filter(c => c.id !== commentId))
    } catch (err) {
      logError({ page: 'content-review', action: 'resolveComment', error: err })
      notifications.show({ color: 'red', title: 'Fout', message: 'Oplossen mislukt.' })
    }
  }

  function renderExercisePreview(variant: ExerciseVariant) {
    const p = variant.payload_json as Record<string, any>
    switch (variant.exercise_type) {
      case 'contrast_pair':
        return <ContrastPairExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
      case 'cloze_mcq':
        return <ClozeMcq previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
      case 'sentence_transformation':
        return <SentenceTransformationExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
      case 'constrained_translation':
        return <ConstrainedTranslationExercise previewMode previewPayload={p} userLanguage="nl" onAnswer={(() => {}) as any} />
      default:
        return <ExerciseSummaryCard variant={variant} comment={commentMap.get(variant.id)} />
    }
  }

  const lessonOptions = lessons.map(l => ({ value: l.id, label: l.title }))
  const typeOptions = [
    { value: '__all', label: 'Alle types' },
    ...Array.from(new Set(variants.map(v => v.exercise_type))).sort()
      .map(t => ({ value: t, label: t })),
  ]

  if (!profile) return <Center h="100vh"><Loader /></Center>
  if (!profile.isAdmin) return null

  return (
    <Container size="md" py="xl">
      <Title order={2} mb="xl">Contentcontrole</Title>

      <Tabs
        defaultValue="browser"
        onChange={(tab) => { if (tab === 'comments') loadOpenComments() }}
      >
        <Tabs.List mb="xl">
          <Tabs.Tab value="browser">Oefeningen</Tabs.Tab>
          <Tabs.Tab value="comments">
            Opmerkingen{openComments.length > 0 ? ` (${openComments.length})` : ''}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="browser">
          <Group mb="lg" align="flex-end">
            <Select
              label="Les"
              placeholder="Selecteer een les"
              data={lessonOptions}
              value={selectedLessonId}
              onChange={setSelectedLessonId}
              maxDropdownHeight={400}
              style={{ flex: 1 }}
            />
            <Select
              label="Type"
              data={typeOptions}
              value={selectedType ?? '__all'}
              onChange={v => setSelectedType(v === '__all' ? null : v)}
              disabled={variants.length === 0}
              style={{ flex: 1 }}
            />
          </Group>

          {loading && <Center py="xl"><Loader /></Center>}

          {!loading && selectedLessonId && filteredVariants.length === 0 && (
            <Center py="xl">
              <Text c="dimmed">Geen oefeningen gevonden voor deze les.</Text>
            </Center>
          )}

          {!loading && current && (
            <Stack gap="lg">
              <Group justify="space-between">
                <Group gap="xs">
                  <Text size="sm" c="dimmed">{index + 1} / {filteredVariants.length}</Text>
                  {commentMap.has(current.id) && (
                    <Badge variant="light" color="orange" size="sm">💬 opmerking</Badge>
                  )}
                </Group>
                <Group gap="xs">
                  <Button variant="subtle" size="sm" leftSection={<IconChevronLeft size={16} />}
                    onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}>
                    Vorige
                  </Button>
                  <Button variant="subtle" size="sm" rightSection={<IconChevronRight size={16} />}
                    onClick={() => setIndex(i => Math.min(filteredVariants.length - 1, i + 1))}
                    disabled={index === filteredVariants.length - 1}>
                    Volgende
                  </Button>
                </Group>
              </Group>

              {renderExercisePreview(current)}

              <Box p="lg" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
                <Text size="sm" fw={600} mb="sm">Opmerking</Text>
                <Textarea
                  placeholder="Voeg een opmerking toe over deze oefening..."
                  value={draftComment}
                  onChange={e => setDraftComment(e.currentTarget.value)}
                  minRows={3}
                  autosize
                  mb="sm"
                />
                <Button
                  size="sm"
                  onClick={handleSaveComment}
                  loading={saving}
                  disabled={!draftComment.trim()}
                  color={savedId === current.id ? 'green' : undefined}
                  leftSection={savedId === current.id ? <IconCheck size={14} /> : undefined}
                >
                  {savedId === current.id ? 'Opgeslagen' : 'Opslaan'}
                </Button>
              </Box>
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="comments">
          {commentsLoading && <Center py="xl"><Loader /></Center>}

          {!commentsLoading && openComments.length === 0 && (
            <Center py="xl"><Text c="dimmed">Geen openstaande opmerkingen.</Text></Center>
          )}

          {!commentsLoading && openComments.length > 0 && (
            <Stack gap="sm">
              {openComments.map(c => (
                <Box key={c.id} p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <Text size="sm" fw={600}>{c.lessonTitle}</Text>
                      <Text size="xs" c="cyan">{c.exerciseType}</Text>
                    </Group>
                    <Button size="xs" variant="light" color="green" onClick={() => handleResolve(c.id)}>
                      Opgelost
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed" mb="xs" style={{ fontStyle: 'italic' }}>{c.promptSummary}</Text>
                  <Text size="sm">{c.comment}</Text>
                </Box>
              ))}
            </Stack>
          )}
        </Tabs.Panel>
      </Tabs>
    </Container>
  )
}
