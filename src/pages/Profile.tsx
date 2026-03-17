// src/pages/Profile.tsx
import { useEffect, useState } from 'react'
import {
  Container,
  Title,
  Text,
  TextInput,
  Button,
  Stack,
  Paper,
  Group,
  Center,
  Loader,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { supabase } from '@/lib/supabase'
import { progressService } from '@/services/progressService'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
import type { UserProgress } from '@/types/progress'

export function Profile() {
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        const userProgress = await progressService.getUserProgress(user.id)
        setProgress(userProgress)
        setDisplayName(profile?.fullName ?? '')
      } catch (err) {
        logError({ page: 'profile', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: 'Failed to load profile',
          message: 'Something went wrong. Please try again.',
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, profile])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase
        .schema('indonesian')
        .from('profiles')
        .upsert({ id: user.id, display_name: displayName.trim() || null }, { onConflict: 'id' })
      if (error) throw error
      notifications.show({
        color: 'green',
        title: 'Profile updated',
        message: 'Your display name has been saved.',
      })
    } catch (err) {
      logError({ page: 'profile', action: 'saveDisplayName', error: err })
      notifications.show({
        color: 'red',
        title: 'Failed to save profile',
        message: 'Something went wrong. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Center h="50vh">
        <Loader size="xl" />
      </Center>
    )
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  const level = progress?.current_level ?? 'Beginner'

  return (
    <Container size="sm">
      <Stack gap="xl" my="xl">
        <Title order={2}>Profile</Title>

        <Paper withBorder p="xl" radius="md" shadow="sm">
          <Stack gap="md">
            <Title order={4}>Account</Title>
            <Group gap="sm">
              <Text fw={500} w={120}>Email</Text>
              <Text c="dimmed">{user?.email ?? '—'}</Text>
            </Group>
            <Group gap="sm">
              <Text fw={500} w={120}>Member since</Text>
              <Text c="dimmed">{memberSince}</Text>
            </Group>
            <Group gap="sm">
              <Text fw={500} w={120}>Level</Text>
              <Text c="dimmed">{level}</Text>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder p="xl" radius="md" shadow="sm">
          <Stack gap="md">
            <Title order={4}>Display Name</Title>
            <TextInput
              label="Display name"
              placeholder="Enter your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button onClick={handleSave} loading={saving}>
                Save
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
