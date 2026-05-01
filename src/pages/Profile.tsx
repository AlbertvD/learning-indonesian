// src/pages/Profile.tsx
import { useEffect, useState } from 'react'
import {
  Text,
  TextInput,
  Button,
  Stack,
  Group,
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
import {
  PageContainer,
  PageBody,
  PageHeader,
  SettingsCard,
  LoadingState,
} from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { translations } from '@/lib/i18n'
import { logError } from '@/lib/logger'
import { useAutoplay } from '@/contexts/AutoplayContext'
import { useListening } from '@/contexts/ListeningContext'

export function Profile() {
  const T = useT()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { autoPlay, setAutoPlay } = useAutoplay()
  const { listeningEnabled, setListeningEnabled } = useListening()
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
        message: T.profile.timezoneSaved,
      })
    } catch (err) {
      logError({ page: 'profile', action: 'updateTimezone', error: err })
      notifications.show({
        color: 'red',
        title: T.profile.failedToSave,
        message: T.profile.somethingWentWrong,
      })
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
      <PageContainer size="sm">
        <PageBody>
          <LoadingState />
        </PageBody>
      </PageContainer>
    )
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  return (
    <PageContainer size="sm">
      <PageBody>
        <PageHeader title={T.profile.title} />

        <SettingsCard title={T.profile.account}>
          <Stack gap="md">
            <Group gap="sm">
              <Text fw={500} w={120}>{T.profile.email}</Text>
              <Text c="dimmed">{user?.email ?? '—'}</Text>
            </Group>
            <Group gap="sm">
              <Text fw={500} w={120}>{T.profile.memberSince}</Text>
              <Text c="dimmed">{memberSince}</Text>
            </Group>
          </Stack>
        </SettingsCard>

        <SettingsCard title={T.profile.displayName}>
          <Stack gap="md">
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
        </SettingsCard>

        {isMobile && (
          <SettingsCard title={T.profile.appearance}>
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
          </SettingsCard>
        )}

        <SettingsCard title={T.profile.timezone} description={T.profile.timezoneDescription}>
          <Select
            searchable
            label={T.profile.selectTimezone}
            placeholder={T.profile.pickTimezone}
            data={Intl.supportedValuesOf('timeZone')}
            value={timezone}
            onChange={(val) => {
              setTimezone(val)
              handleTimezoneChange(val)
            }}
            disabled={savingTimezone}
          />
        </SettingsCard>

        <SettingsCard title={T.profile.language}>
          <SegmentedControl
            value={profile?.language ?? 'nl'}
            onChange={(val) => handleLanguageChange(val as 'nl' | 'en')}
            disabled={savingLang}
            data={[
              { label: T.profile.dutch, value: 'nl' },
              { label: T.profile.english, value: 'en' },
            ]}
          />
        </SettingsCard>

        <SettingsCard title={T.profile.autoPlayAudio} description={T.profile.autoPlayAudioDescription}>
          <Switch
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.currentTarget.checked)}
            size="md"
            label={T.profile.autoPlayAudio}
          />
        </SettingsCard>

        <SettingsCard title={T.profile.listeningExercises} description={T.profile.listeningExercisesDescription}>
          <Switch
            checked={listeningEnabled}
            onChange={(e) => setListeningEnabled(e.currentTarget.checked)}
            size="md"
            label={T.profile.enableListeningExercises}
          />
        </SettingsCard>

        <SettingsCard title={T.profile.sessionSize}>
          <Stack gap="md">
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
        </SettingsCard>
      </PageBody>
    </PageContainer>
  )
}
