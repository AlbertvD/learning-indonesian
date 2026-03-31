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
  SegmentedControl,
  Switch,
  Slider,
  Box,
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconMoon, IconSun } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { translations } from '@/lib/i18n'
import { logError } from '@/lib/logger'

export function Profile() {
  const T = useT()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)
  const updateDisplayName = useAuthStore((state) => state.updateDisplayName)
  const updateLanguage = useAuthStore((state) => state.updateLanguage)
  const updatePreferredSessionSize = useAuthStore((state) => state.updatePreferredSessionSize)

  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [sessionSize, setSessionSize] = useState(15)
  const [saving, setSaving] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [savingSessionSize, setSavingSessionSize] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Use the saved display_name from the auth store profile
        setDisplayName(profile?.fullName ?? '')
        setSessionSize(profile?.preferredSessionSize ?? 15)
      } catch (err) {
        logError({ page: 'profile', action: 'fetchData', error: err })
        notifications.show({
          color: 'red',
          title: T.profile.failedToLoad,
          message: T.profile.somethingWentWrong,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user, profile, T])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      await updateDisplayName(displayName)
      notifications.show({
        color: 'green',
        title: T.profile.profileUpdated,
        message: T.profile.displayNameSaved,
      })
    } catch (err) {
      logError({ page: 'profile', action: 'saveDisplayName', error: err })
      notifications.show({
        color: 'red',
        title: T.profile.failedToSave,
        message: T.profile.somethingWentWrong,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleLanguageChange(lang: 'nl' | 'en') {
    setSavingLang(true)
    try {
      await updateLanguage(lang)
      // Use the new language's translations directly — T is captured at render
      // time in the old language, so the toast would appear in the wrong language
      // if we used T here.
      const newT = translations[lang]
      notifications.show({
        color: 'green',
        title: newT.profile.profileUpdated,
        message: newT.profile.languageSaved,
      })
    } catch (err) {
      logError({ page: 'profile', action: 'updateLanguage', error: err })
      notifications.show({
        color: 'red',
        title: T.profile.failedToSave,
        message: T.profile.somethingWentWrong,
      })
    } finally {
      setSavingLang(false)
    }
  }

  async function handleSessionSizeChange(size: number) {
    setSavingSessionSize(true)
    try {
      await updatePreferredSessionSize(size)
      notifications.show({
        color: 'green',
        title: T.profile.profileUpdated,
        message: T.profile.sessionSizeSaved,
      })
    } catch (err) {
      logError({ page: 'profile', action: 'updateSessionSize', error: err })
      notifications.show({
        color: 'red',
        title: T.profile.failedToSave,
        message: T.profile.somethingWentWrong,
      })
      // Reset to previous value on error
      setSessionSize(profile?.preferredSessionSize ?? 15)
    } finally {
      setSavingSessionSize(false)
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

  const paperProps = isMobile ? {
    style: {
      background: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.60)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.07)',
      boxShadow: 'none',
    },
  } : { withBorder: true, shadow: 'sm' as const }

  return (
    <Container size="sm">
      <Stack gap="xl" my="xl">
        <Title order={2}>{T.profile.title}</Title>

        <Paper p="xl" radius="md" {...paperProps}>
          <Stack gap="md">
            <Title order={4}>{T.profile.account}</Title>
            <Group gap="sm">
              <Text fw={500} w={120}>{T.profile.email}</Text>
              <Text c="dimmed">{user?.email ?? '—'}</Text>
            </Group>
            <Group gap="sm">
              <Text fw={500} w={120}>{T.profile.memberSince}</Text>
              <Text c="dimmed">{memberSince}</Text>
            </Group>
          </Stack>
        </Paper>

        <Paper p="xl" radius="md" {...paperProps}>
          <Stack gap="md">
            <Title order={4}>{T.profile.displayName}</Title>
            <TextInput
              label={T.profile.displayName}
              placeholder={T.profile.displayNamePlaceholder}
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button onClick={handleSave} loading={saving}>
                {T.profile.save}
              </Button>
            </Group>
          </Stack>
        </Paper>

        {isMobile && (
          <Paper p="xl" radius="md" {...paperProps}>
            <Stack gap="md">
              <Title order={4}>{T.profile.appearance}</Title>
              <Group justify="space-between">
                <Group gap="xs">
                  {colorScheme === 'dark' ? <IconMoon size={16} /> : <IconSun size={16} />}
                  <Text size="sm">{colorScheme === 'dark' ? T.profile.darkMode : T.profile.lightMode}</Text>
                </Group>
                <Switch
                  checked={colorScheme === 'dark'}
                  onChange={toggleColorScheme}
                  size="md"
                />
              </Group>
            </Stack>
          </Paper>
        )}

        <Paper p="xl" radius="md" {...paperProps}>
          <Stack gap="md">
            <Title order={4}>{T.profile.language}</Title>
            <SegmentedControl
              value={profile?.language ?? 'nl'}
              onChange={(val) => handleLanguageChange(val as 'nl' | 'en')}
              disabled={savingLang}
              data={[
                { label: T.profile.dutch, value: 'nl' },
                { label: T.profile.english, value: 'en' },
              ]}
            />
          </Stack>
        </Paper>

        <Paper p="xl" radius="md" {...paperProps}>
          <Stack gap="md">
            <Box>
              <Title order={4} mb="xs">{T.profile.sessionSize}</Title>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{T.profile.sessionSizeDescription}</Text>
                <Text fw={600}>{sessionSize}</Text>
              </Group>
            </Box>
            <Slider
              value={sessionSize}
              onChange={setSessionSize}
              onChangeEnd={handleSessionSizeChange}
              min={5}
              max={30}
              step={1}
              disabled={savingSessionSize}
              marks={[
                { value: 5, label: '5' },
                { value: 15, label: '15' },
                { value: 30, label: '30' },
              ]}
              label={(value) => `${value} ${T.profile.items}`}
            />
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
