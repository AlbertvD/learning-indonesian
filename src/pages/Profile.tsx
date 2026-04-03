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
  Select,
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconMoon, IconSun, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
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
  const updateTimezone = useAuthStore((state) => state.updateTimezone)

  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [sessionSize, setSessionSize] = useState(15)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [savingSessionSize, setSavingSessionSize] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        // Use the saved display_name from the auth store profile
        setDisplayName(profile?.fullName ?? '')
        setSessionSize(profile?.preferredSessionSize ?? 15)
        setTimezone(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
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

  async function handleTimezoneChange(tz: string | null) {
    if (!tz) return
    setSavingTimezone(true)
    try {
      await updateTimezone(tz)
      notifications.show({
        color: 'green',
        title: T.profile.profileUpdated,
        message: 'Timezone saved successfully',
      })
    } catch (err) {
      logError({ page: 'profile', action: 'updateTimezone', error: err })
      notifications.show({
        color: 'red',
        title: T.profile.failedToSave,
        message: T.profile.somethingWentWrong,
      })
      // Reset to previous value on error
      setTimezone(profile?.timezone ?? null)
    } finally {
      setSavingTimezone(false)
    }
  }

  function handleDecreaseSessionSize() {
    const newSize = Math.max(5, sessionSize - 1)
    setSessionSize(newSize)
    handleSessionSizeChange(newSize)
  }

  function handleIncreaseSessionSize() {
    const newSize = Math.min(50, sessionSize + 1)
    setSessionSize(newSize)
    handleSessionSizeChange(newSize)
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
            <Box>
              <Title order={4} mb="xs">Timezone</Title>
              <Text size="sm" c="dimmed">Set your timezone for weekly goal tracking.</Text>
            </Box>
            <Select
              searchable
              label="Select your timezone"
              placeholder="Pick one"
              data={Intl.supportedValuesOf('timeZone')}
              value={timezone}
              onChange={(val) => {
                setTimezone(val)
                handleTimezoneChange(val)
              }}
              disabled={savingTimezone}
            />
          </Stack>
        </Paper>

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
            <Title order={4}>{T.profile.sessionSize}</Title>
            <Group justify="center" gap="md">
              <Button
                variant="default"
                size="sm"
                onClick={handleDecreaseSessionSize}
                disabled={savingSessionSize || sessionSize <= 5}
              >
                <IconChevronLeft size={16} />
              </Button>
              <Text size="lg" fw={700} w={40} ta="center">
                {sessionSize}
              </Text>
              <Button
                variant="default"
                size="sm"
                onClick={handleIncreaseSessionSize}
                disabled={savingSessionSize || sessionSize >= 50}
              >
                <IconChevronRight size={16} />
              </Button>
            </Group>
            <Box w="100%">
              <Slider
                value={sessionSize}
                onChange={setSessionSize}
                onChangeEnd={handleSessionSizeChange}
                min={5}
                max={50}
                step={1}
                disabled={savingSessionSize}
                marks={[
                  { value: 5, label: '5' },
                  { value: 15, label: '15' },
                  { value: 30, label: '30' },
                  { value: 50, label: '50' },
                ]}
                label={(value) => `${value} ${T.profile.items}`}
              />
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
