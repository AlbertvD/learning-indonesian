// src/pages/Register.tsx
//
// Open signup (payment is the gate, not an invite code — docs/plans/
// 2026-07-12-oauth-stripe-entitlement-design.md, owner decision #2). Calls
// authStore.signUp directly; the invite-code field and the signup-with-invite
// edge function are retired.

import { useState } from 'react'
import { PasswordInput, TextInput, Button, Stack, Text, Divider } from '@mantine/core'
import { IconBrandGoogle } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { notifications } from '@mantine/notifications'
import { AuthApiError } from '@supabase/supabase-js'
import { PageFormLayout } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
// See Login.tsx — auth pages render before the user profile loads, so we
// pin the language to NL (the project default) until EN-first onboarding
// is introduced.
import { nl as T } from '@/lib/i18n'

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  // Set when GoTrue accepts the signup but withholds a session pending email
  // confirmation. Swaps the form for the check-your-inbox panel rather than
  // navigating, because there is no session to navigate with.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [resending, setResending] = useState(false)
  const navigate = useNavigate()
  const signUp = useAuthStore(s => s.signUp)
  const resendConfirmation = useAuthStore(s => s.resendConfirmation)
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { needsConfirmation } = await signUp(email, password, fullName)
      if (needsConfirmation) {
        // Deliberately no success notification here: the panel IS the message,
        // and a green "Registration successful" toast next to "confirm your
        // email" reads as though the account is already usable.
        setAwaitingConfirmation(true)
        return
      }
      notifications.show({
        color: 'green',
        title: T.register.registrationSuccess,
        message: T.register.accountCreated,
      })
      // Day-one loanword-bridge onboarding (Bet-1 §3.4) instead of the dashboard.
      navigate('/welkom')
    } catch (err) {
      const message = err instanceof AuthApiError && err.code === 'user_already_exists'
        ? T.register.emailTaken
        : T.register.somethingWentWrong
      notifications.show({
        color: 'red',
        title: T.register.registrationFailed,
        message,
      })
      logError({ page: 'Register', action: 'signUp', error: err })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // On success the browser navigates away to Google immediately; no
      // further action here.
    } catch (err) {
      notifications.show({
        color: 'red',
        title: T.register.registrationFailed,
        message: T.register.oauthFailed,
      })
      logError({ page: 'Register', action: 'signInWithGoogle', error: err })
      setGoogleLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await resendConfirmation(email)
      notifications.show({
        color: 'green',
        title: T.register.resendSent,
        message: T.register.resendSentBody,
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: T.register.resendFailed,
        message: T.register.resendFailedBody,
      })
      logError({ page: 'Register', action: 'resendConfirmation', error: err })
    } finally {
      setResending(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <PageFormLayout title={T.register.checkInboxTitle}>
        <Stack gap="md">
          <Text size="sm">
            {T.register.checkInboxBody} <strong>{email}</strong>
          </Text>
          <Text size="sm" c="dimmed">
            {T.register.checkInboxHint}
          </Text>
          <Button variant="default" fullWidth onClick={handleResend} loading={resending}>
            {T.register.resendConfirmation}
          </Button>
          <Text size="sm" c="dimmed">
            <a href="/login">{T.register.backToLogin}</a>
          </Text>
        </Stack>
      </PageFormLayout>
    )
  }

  return (
    <PageFormLayout title={T.register.title}>
      <Stack gap="md">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={T.register.fullName}
              placeholder={T.register.fullNamePlaceholder}
              value={fullName}
              onChange={(e) => setFullName(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <TextInput
              label={T.register.email}
              placeholder={T.register.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <PasswordInput
              label={T.register.password}
              placeholder={T.register.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <Button type="submit" fullWidth loading={loading}>
              {T.register.createAccount}
            </Button>
          </Stack>
        </form>
        <Divider label={T.register.orDivider} labelPosition="center" />
        <Button
          variant="default"
          fullWidth
          leftSection={<IconBrandGoogle size={18} />}
          onClick={handleGoogle}
          loading={googleLoading}
        >
          {T.register.continueWithGoogle}
        </Button>
        <Text size="sm" c="dimmed">
          {T.register.alreadyHaveAccount} <a href="/login">{T.register.logIn}</a>
        </Text>
        <Text size="sm" c="dimmed">
          <a href="/privacy">{T.privacy.viewLink}</a>
        </Text>
      </Stack>
    </PageFormLayout>
  )
}
