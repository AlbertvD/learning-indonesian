// src/pages/Profile.tsx
import { useEffect, useState } from 'react'
import {
  Text,
  TextInput,
  Button,
  Stack,
  Group,
  Switch,
  Slider,
  Select,
  Modal,
} from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconMoon, IconSun, IconLogout, IconFlame, IconClock } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'
import { useNavigate } from 'react-router'
import { notifications } from '@mantine/notifications'
import {
  PageContainer,
  PageBody,
  HeroCard,
  SettingsCard,
  StatusPill,
  LoadingState,
} from '@/components/page/primitives'
import { PaywallPanel } from '@/components/paywall/PaywallPanel'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { engagement } from '@/lib/analytics/engagement'
import { useAutoplay } from '@/contexts/AutoplayContext'
import { useListening } from '@/contexts/ListeningContext'
import { useSpreektaal } from '@/contexts/SpreektaalContext'
import { entitlementService, isActiveStatus, type Entitlement } from '@/services/entitlementService'
import { extractEdgeFunctionErrorCode } from '@/lib/edgeFunctionError'
import classes from './Profile.module.css'

// Avatar initials — first + last initial of the display name, or the email's
// first letter when no name is set. Never empty (falls back to '?').
function initials(name: string, email: string): string {
  const trimmed = name.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
    return (first + last).toUpperCase()
  }
  return (email.trim()[0] ?? '?').toUpperCase()
}

interface Momentum {
  streakDays: number
  minutesThisWeek: number
}

export function Profile() {
  const T = useT()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const { autoPlay, setAutoPlay } = useAutoplay()
  const { listeningEnabled, setListeningEnabled } = useListening()
  const { spreektaalEnabled, setSpreektaalEnabled } = useSpreektaal()
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  const user = useAuthStore((state) => state.user)
  const profile = useAuthStore((state) => state.profile)
  const updateDisplayName = useAuthStore((state) => state.updateDisplayName)
  const updatePreferredSessionSize = useAuthStore((state) => state.updatePreferredSessionSize)
  const updateTimezone = useAuthStore((state) => state.updateTimezone)
  const signOut = useAuthStore((state) => state.signOut)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [sessionSize, setSessionSize] = useState(20)
  const [timezone, setTimezone] = useState<string | null>(null)
  const [momentum, setMomentum] = useState<Momentum | null>(null)
  const [savingSessionSize, setSavingSessionSize] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null)
  const [entitlementLoading, setEntitlementLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!user) return
      try {
        setDisplayName(profile?.fullName ?? '')
        setSessionSize(profile?.preferredSessionSize ?? 20)
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

  // Subscription block's own data source — the owner-RLS-readable entitlement
  // row (docs/plans/2026-07-12-oauth-stripe-entitlement-design.md §5). Kept
  // separate from `profile.isEntitled` (a derived boolean) because this block
  // needs the full row: `status` for the friendly label and
  // `stripe_customer_id` to gate the Manage-subscription button.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setEntitlementLoading(true)
    entitlementService.getEntitlement(user.id)
      .then((row) => { if (!cancelled) setEntitlement(row) })
      .catch((err) => {
        if (cancelled) return
        logError({ page: 'profile', action: 'fetchEntitlement', error: err })
        notifications.show({ color: 'red', title: T.common.error, message: T.profile.entitlementLoadFailed })
      })
      .finally(() => { if (!cancelled) setEntitlementLoading(false) })
    return () => { cancelled = true }
  }, [user, T])

  // Momentum stats for the hero — streak + minutes this week. Best-effort:
  // a failure just hides the row (the hero still shows identity + member-since),
  // so it never blocks the page. Same source Dashboard reads (Dashboard.tsx).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    engagement
      .practiceTime(user.id, tz)
      .then((pt) => {
        if (!cancelled) setMomentum({ streakDays: pt.streakDays, minutesThisWeek: pt.minutesThisWeek })
      })
      .catch((err) => {
        logError({ page: 'profile', action: 'fetchMomentum', error: err })
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function handleSaveDisplayName() {
    if (!user) return
    if (displayName.trim() === (profile?.fullName ?? '').trim()) return
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
      setSessionSize(profile?.preferredSessionSize ?? 20)
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

  async function handleManageSubscription() {
    setPortalLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal')
      if (error) throw error
      const url = (data as { url?: string } | null)?.url
      if (!url) throw new Error('customer-portal returned no url')
      window.location.href = url
      // Browser is navigating away — no further state update needed.
    } catch (err) {
      const code = await extractEdgeFunctionErrorCode(err)
      const message = code === 'invalid_user_jwt' || code === 'missing_user_jwt'
        ? T.paywall.sessionExpired
        : T.profile.somethingWentWrong
      notifications.show({
        color: 'red',
        title: T.profile.manageSubscriptionFailed,
        message,
      })
      logError({ page: 'profile', action: 'manageSubscription', error: err })
      setPortalLoading(false)
    }
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account')
      if (error) throw error
      // Success: no further authenticated writes are needed or possible —
      // the account (and every row FK'd to it) is already gone server-side.
      await signOut()
      navigate('/login')
    } catch (err) {
      const code = await extractEdgeFunctionErrorCode(err)
      const message = code === 'invalid_user_jwt' || code === 'missing_user_jwt'
        ? T.profile.deleteAccountSessionExpired
        : T.profile.somethingWentWrong
      notifications.show({
        color: 'red',
        title: T.profile.deleteAccountFailedTitle,
        message,
      })
      logError({ page: 'profile', action: 'deleteAccount', error: err })
      setDeletingAccount(false)
    }
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

  const email = user?.email ?? ''
  const savedName = (profile?.fullName ?? '').trim()
  const heroName = savedName || email || '—'
  const showEmailLine = Boolean(savedName) && Boolean(email)
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—'

  // Subscription block derived state (§5): a row exists but isn't in the
  // active set (canceled) reads differently from never-having-subscribed —
  // both get the PaywallPanel subscribe CTA, but the status label differs.
  // Admins reach every lesson through has_active_entitlement()'s admin arm with
  // no entitlements row, and authStore's isEntitledFrom() mirrors that for the
  // rest of the app. Without this, the page that REPORTS your status was the
  // one surface contradicting the product — an admin saw "Gratis niveau" and a
  // subscribe CTA for access they already had (2026-08-16).
  //
  // A real paid row still wins the label: admin access is additional, and
  // masking a subscription someone is actually paying for would stop this being
  // a truthful account statement.
  const rowGrantsAccess = !!entitlement && isActiveStatus(entitlement.status)
  const adminOnlyAccess = profile?.isAdmin === true && !rowGrantsAccess

  const isFreePlan = !rowGrantsAccess && !adminOnlyAccess
  const statusLabel = adminOnlyAccess
    ? T.profile.subscriptionStatusAdmin
    : !entitlement
    ? T.profile.subscriptionStatusFree
    : entitlement.status === 'active' ? T.profile.subscriptionStatusActive
    : entitlement.status === 'past_due' ? T.profile.subscriptionStatusPastDue
    : entitlement.status === 'comped' ? T.profile.subscriptionStatusComped
    : T.profile.subscriptionStatusCanceled
  const statusTone = adminOnlyAccess ? 'success'
    : !entitlement ? 'neutral'
    : entitlement.status === 'active' || entitlement.status === 'comped' ? 'success'
    : entitlement.status === 'past_due' ? 'warning'
    : 'neutral'

  return (
    <PageContainer size="sm">
      <PageBody>
        <Stack gap="lg">
          {/* ── Identity hero ─────────────────────────────────────────────── */}
          <HeroCard>
            <div className={classes.heroTop}>
              <div className={classes.identity}>
                <div className={classes.avatar} aria-hidden="true">
                  {initials(savedName, email)}
                </div>
                <div className={classes.identityText}>
                  <div className={classes.name}>{heroName}</div>
                  {showEmailLine && <div className={classes.email}>{email}</div>}
                  <div className={classes.memberSince}>
                    {T.profile.memberSince} {memberSince}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={classes.signOut}
                onClick={async () => {
                  await signOut()
                  navigate('/')
                }}
              >
                <IconLogout size={15} />
                {T.nav.logout}
              </button>
            </div>

            {momentum && (
              <div className={classes.momentum}>
                <div className={classes.stat}>
                  <IconFlame size={20} className={classes.statIcon} />
                  <div className={classes.statText}>
                    <span className={classes.statValue}>{momentum.streakDays}</span>
                    <span className={classes.statLabel}>{T.profile.streakTileLabel}</span>
                  </div>
                </div>
                <div className={classes.stat}>
                  <IconClock size={20} className={classes.statIcon} />
                  <div className={classes.statText}>
                    <span className={classes.statValue}>{momentum.minutesThisWeek}</span>
                    <span className={classes.statLabel}>{T.profile.minutesTileLabel}</span>
                  </div>
                </div>
              </div>
            )}
          </HeroCard>

          {/* ── Subscription ──────────────────────────────────────────────── */}
          {!entitlementLoading && (
            <SettingsCard
              title={T.profile.subscriptionTitle}
              aside={<StatusPill tone={statusTone}>{statusLabel}</StatusPill>}
            >
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  {adminOnlyAccess
                    ? T.profile.subscriptionAdminIntro
                    : !entitlement
                    ? T.profile.subscriptionFreeIntro
                    : entitlement.status === 'canceled'
                    ? T.profile.subscriptionCanceledIntro
                    : entitlement.current_period_end
                    ? T.profile.subscriptionRenewsOn(new Date(entitlement.current_period_end).toLocaleDateString())
                    : null}
                </Text>
                {entitlement?.stripe_customer_id && (
                  <Group justify="flex-end">
                    <Button variant="default" loading={portalLoading} onClick={handleManageSubscription}>
                      {T.profile.manageSubscription}
                    </Button>
                  </Group>
                )}
                {isFreePlan && <PaywallPanel />}
              </Stack>
            </SettingsCard>
          )}

          {/* ── Account & display ─────────────────────────────────────────── */}
          <SettingsCard title={T.profile.accountAndDisplay}>
            <div className={classes.rows}>
              <div className={classes.rowStacked}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.displayName}</span>
                </div>
                <TextInput
                  aria-label={T.profile.displayName}
                  placeholder={T.profile.displayNamePlaceholder}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.currentTarget.value)}
                  onBlur={handleSaveDisplayName}
                />
              </div>

              {/* NL/EN language switch REMOVED 2026-08-02 — launching Dutch-only.
                  Not a code problem: the EN translations are complete (1,552
                  i18n keys) and all 30 EN grammar episodes exist on disk. But
                  they are not published, so an English learner would get a full
                  UI with NO grammar audio on any lesson — the band renders
                  nothing when its language's episode is missing
                  (LessonGrammarAudioBand.tsx:36). Offering the switch would sell
                  a degraded product.

                  Everything needed to restore it is intact: `translations.en`,
                  `authStore.updateLanguage`, and `profiles.language`. Bring back
                  this row once the EN episodes are published — or not, if
                  English ships as a separate product for a different audience
                  (the loanword bridge, this app's real differentiator, is
                  Dutch-specific and does not transfer). */}

              {/* Dark-mode toggle is mobile-only — desktop keeps it in the rail,
                  so surfacing it here would duplicate that control. */}
              {isMobile && (
                <div className={classes.row}>
                  <div className={classes.rowLabel}>
                    <span className={classes.rowTitle}>{T.profile.appearance}</span>
                  </div>
                  <Group gap="xs" className={classes.rowControl}>
                    {colorScheme === 'dark' ? <IconMoon size={16} /> : <IconSun size={16} />}
                    <Switch
                      aria-label={colorScheme === 'dark' ? T.profile.darkMode : T.profile.lightMode}
                      checked={colorScheme === 'dark'}
                      onChange={toggleColorScheme}
                      size="md"
                    />
                  </Group>
                </div>
              )}

              <div className={classes.rowStacked}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.timezone}</span>
                  <span className={classes.rowDesc}>{T.profile.timezoneDescription}</span>
                </div>
                <Select
                  searchable
                  aria-label={T.profile.selectTimezone}
                  placeholder={T.profile.pickTimezone}
                  data={Intl.supportedValuesOf('timeZone')}
                  value={timezone}
                  onChange={(val) => {
                    setTimezone(val)
                    handleTimezoneChange(val)
                  }}
                  disabled={savingTimezone}
                />
              </div>
            </div>
          </SettingsCard>

          {/* ── Practice ──────────────────────────────────────────────────── */}
          <SettingsCard title={T.profile.practiceSettings}>
            <div className={classes.rows}>
              <div className={classes.rowStacked}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.sessionSize}</span>
                  <span className={classes.rowDesc}>{T.profile.sessionSizeDescription}</span>
                </div>
                <div>
                  <div className={classes.sessionValue}>{sessionSize}</div>
                  <div className={classes.sessionUnit}>{T.profile.items}</div>
                  <Slider
                    mt="md"
                    className={classes.sessionSlider}
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
                </div>
              </div>

              <div className={classes.row}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.autoPlayAudio}</span>
                  <span className={classes.rowDesc}>{T.profile.autoPlayAudioDescription}</span>
                </div>
                <Switch
                  className={classes.rowControl}
                  aria-label={T.profile.autoPlayAudio}
                  checked={autoPlay}
                  onChange={(e) => setAutoPlay(e.currentTarget.checked)}
                  size="md"
                />
              </div>

              <div className={classes.row}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.listeningExercises}</span>
                  <span className={classes.rowDesc}>{T.profile.listeningExercisesDescription}</span>
                </div>
                <Switch
                  className={classes.rowControl}
                  aria-label={T.profile.enableListeningExercises}
                  checked={listeningEnabled}
                  onChange={(e) => setListeningEnabled(e.currentTarget.checked)}
                  size="md"
                />
              </div>

              <div className={classes.row}>
                <div className={classes.rowLabel}>
                  <span className={classes.rowTitle}>{T.profile.spreektaal}</span>
                  <span className={classes.rowDesc}>{T.profile.spreektaalDescription}</span>
                </div>
                <Switch
                  className={classes.rowControl}
                  aria-label={T.profile.enableSpreektaal}
                  checked={spreektaalEnabled}
                  onChange={(e) => setSpreektaalEnabled(e.currentTarget.checked)}
                  size="md"
                />
              </div>
            </div>
          </SettingsCard>

          {/* ── Danger zone ───────────────────────────────────────────────── */}
          <SettingsCard title={T.profile.deleteAccountSectionTitle} tone="danger">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                {T.profile.deleteAccountDescription}{' '}
                <a href="/privacy">{T.privacy.viewLink}</a>
              </Text>
              <Group justify="flex-end">
                <Button color="red" variant="outline" onClick={() => setDeleteModalOpen(true)}>
                  {T.profile.deleteAccountButton}
                </Button>
              </Group>
            </Stack>
          </SettingsCard>
        </Stack>
      </PageBody>

      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setDeleteConfirmText('')
        }}
        title={T.profile.deleteAccountModalTitle}
      >
        <Stack gap="md">
          <Text size="sm" c="red">
            {T.profile.deleteAccountModalWarning}
          </Text>
          <Text size="sm">
            {T.profile.deleteAccountConfirmInstruction}{' '}
            <Text component="span" fw={700}>{user?.email}</Text>
          </Text>
          <TextInput
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.currentTarget.value)}
            placeholder={T.profile.deleteAccountConfirmPlaceholder}
            disabled={deletingAccount}
          />
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => {
                setDeleteModalOpen(false)
                setDeleteConfirmText('')
              }}
              disabled={deletingAccount}
            >
              {T.profile.deleteAccountCancelButton}
            </Button>
            <Button
              color="red"
              onClick={handleDeleteAccount}
              loading={deletingAccount}
              disabled={!user?.email || deleteConfirmText !== user.email}
            >
              {T.profile.deleteAccountConfirmButton}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageContainer>
  )
}
