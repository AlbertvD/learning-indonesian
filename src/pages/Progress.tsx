// src/pages/Progress.tsx
import { useEffect, useState } from 'react'
import {
  Container,
  Title,
  Text,
  Stack,
  Paper,
  Group,
  Center,
  Loader,
  Progress as MantineProgress,
  Box,
  RingProgress,
  SimpleGrid,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { learnerStateService } from '@/services/learnerStateService'
import { lessonService } from '@/services/lessonService'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'

export function Progress() {
  const T = useT()
  const user = useAuthStore((state) => state.user)

  const [loading, setLoading] = useState(true)
  const [itemsByStage, setItemsByStage] = useState({ new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 })
  const [skillStats, setSkillStats] = useState({ avgRecognition: 0, avgRecall: 0 })
  const [lessonsCompleted, setLessonsCompleted] = useState({ completed: 0, total: 0 })
  const [dueStats, setDueStats] = useState({ today: 0, thisWeek: 0 })

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Fetch item states by stage
        const itemStates = await learnerStateService.getItemStates(user.id)
        const stageCounts = {
          new: 0,
          anchoring: 0,
          retrieving: 0,
          productive: 0,
          maintenance: 0,
        }
        for (const state of itemStates) {
          stageCounts[state.stage]++
        }
        setItemsByStage(stageCounts)

        // Fetch skill states for strength comparison
        if (itemStates.length > 0) {
          const skillStates = await learnerStateService.getAllSkillStates(user.id)

          // Separate by skill type and calculate average stability
          const recognitionStabilities: number[] = []
          const recallStabilities: number[] = []
          for (const skill of skillStates) {
            if (skill.skill_type === 'recognition') {
              recognitionStabilities.push(skill.stability)
            } else if (skill.skill_type === 'recall') {
              recallStabilities.push(skill.stability)
            }
          }

          const avgRecognition = recognitionStabilities.length > 0
            ? Math.round(recognitionStabilities.reduce((a, b) => a + b, 0) / recognitionStabilities.length * 100) / 100
            : 0
          const avgRecall = recallStabilities.length > 0
            ? Math.round(recallStabilities.reduce((a, b) => a + b, 0) / recallStabilities.length * 100) / 100
            : 0

          setSkillStats({ avgRecognition, avgRecall })

          // Calculate due stats
          const now = new Date()
          const today = new Date(now)
          today.setHours(0, 0, 0, 0)
          const endOfToday = new Date(today)
          endOfToday.setHours(23, 59, 59, 999)

          const weekFromNow = new Date(now)
          weekFromNow.setDate(weekFromNow.getDate() + 7)

          let dueToday = 0
          let dueThisWeek = 0
          for (const skill of skillStates) {
            if (skill.next_due_at) {
              const dueDate = new Date(skill.next_due_at)
              if (dueDate <= endOfToday) {
                dueToday++
              } else if (dueDate <= weekFromNow) {
                dueThisWeek++
              }
            }
          }
          setDueStats({ today: dueToday, thisWeek: dueThisWeek + dueToday })
        }

        // Fetch lesson completion progress
        const [lessonProgress, lessons] = await Promise.all([
          lessonService.getUserLessonProgress(user.id),
          lessonService.getLessonsBasic(),
        ])

        const completed = lessonProgress.filter((lp: any) => lp.completed_at != null)
        setLessonsCompleted({ completed: completed.length, total: lessons.length })
      } catch (err) {
        logError({ page: 'progress', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.common.error,
          message: T.common.somethingWentWrong,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, T.common.error, T.common.somethingWentWrong])

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" color="cyan" />
      </Center>
    )
  }

  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)
  const recognitionStrengthPercent = Math.min(100, Math.round((skillStats.avgRecognition / 10) * 100))
  const recallStrengthPercent = Math.min(100, Math.round((skillStats.avgRecall / 10) * 100))
  const lessonProgressPercent = lessonsCompleted.total > 0 ? Math.round((lessonsCompleted.completed / lessonsCompleted.total) * 100) : 0

  return (
    <Container size="md">
      <Stack gap="xl" my="xl">
        <Title order={2}>{T.progress.title}</Title>

        {/* Items by stage */}
        <Paper p="xl" radius="md" withBorder>
          <Stack gap="md">
            <Box>
              <Title order={4} mb="md">{T.progress.itemsByStage}</Title>
              <Text size="sm" c="dimmed" mb="xl">{T.progress.totalItems}: {totalItems}</Text>
            </Box>

            <Stack gap="sm">
              {[
                { stage: 'maintenance', label: T.progress.stable, count: itemsByStage.maintenance, color: 'green' },
                { stage: 'productive', label: T.progress.productive, count: itemsByStage.productive, color: 'teal' },
                { stage: 'retrieving', label: T.progress.learning, count: itemsByStage.retrieving, color: 'blue' },
                { stage: 'anchoring', label: T.progress.anchoring, count: itemsByStage.anchoring, color: 'yellow' },
                { stage: 'new', label: T.progress.new, count: itemsByStage.new, color: 'gray' },
              ].map((item) => (
                <Box key={item.stage}>
                  <Group justify="space-between" mb="4">
                    <Text size="sm">{item.label}</Text>
                    <Text size="sm" fw={500}>{item.count}</Text>
                  </Group>
                  <MantineProgress
                    value={totalItems > 0 ? (item.count / totalItems) * 100 : 0}
                    color={item.color}
                    size="md"
                    radius="md"
                  />
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>

        {/* Memory strength */}
        <Paper p="xl" radius="md" withBorder>
          <Stack gap="md">
            <Title order={4}>{T.progress.memoryStrength}</Title>
            <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="lg">
              <Box style={{ textAlign: 'center' }}>
                <RingProgress
                  sections={[{ value: recognitionStrengthPercent, color: 'blue' }]}
                  label={(
                    <div>
                      <Text fw={700} ta="center">{recognitionStrengthPercent}%</Text>
                      <Text size="xs" c="dimmed" ta="center">{T.progress.recognition}</Text>
                    </div>
                  )}
                />
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <RingProgress
                  sections={[{ value: recallStrengthPercent, color: 'grape' }]}
                  label={(
                    <div>
                      <Text fw={700} ta="center">{recallStrengthPercent}%</Text>
                      <Text size="xs" c="dimmed" ta="center">{T.progress.recall}</Text>
                    </div>
                  )}
                />
              </Box>
            </SimpleGrid>
          </Stack>
        </Paper>

        {/* Lesson completion */}
        <Paper p="xl" radius="md" withBorder>
          <Stack gap="md">
            <Box>
              <Title order={4} mb="md">{T.progress.lessonCompletion}</Title>
              <Group justify="space-between" mb="md">
                <Text size="sm">
                  {lessonsCompleted.completed} / {lessonsCompleted.total} {T.progress.lessonsCompleted}
                </Text>
                <Text size="sm" fw={500}>{lessonProgressPercent}%</Text>
              </Group>
            </Box>
            <MantineProgress
              value={lessonProgressPercent}
              color="indigo"
              size="lg"
              radius="md"
            />
          </Stack>
        </Paper>

        {/* Due dates */}
        <Paper p="xl" radius="md" withBorder>
          <Stack gap="md">
            <Title order={4}>{T.progress.dueItems}</Title>
            <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="lg">
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} mb="4">
                  {dueStats.today}
                </Text>
                <Text size="sm" c="dimmed">{T.progress.dueToday}</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="xl" fw={700} mb="4">
                  {dueStats.thisWeek}
                </Text>
                <Text size="sm" c="dimmed">{T.progress.dueThisWeek}</Text>
              </Box>
            </SimpleGrid>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
