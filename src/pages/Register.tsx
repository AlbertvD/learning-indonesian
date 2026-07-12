// src/pages/Register.tsx
import { useState } from 'react'
import { PasswordInput, TextInput, Button, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { PageFormLayout } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'
// See Login.tsx — auth pages render before the user profile loads, so we
// pin the language to NL (the project default) until EN-first onboarding
// is introduced.
import { nl as T } from '@/lib/i18n'

// The edge function returns { error: <code> } on non-2xx. functions.invoke
// never throws — it resolves { data: null, error: FunctionsHttpError } whose
// .context is the raw Response. Best-effort parse; unknown/unparseable shapes
// fall back to the generic message.
async function extractErrorCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof FunctionsHttpError)) return undefined
  try {
    const body = await error.context.json()
    return typeof body?.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const signIn = useAuthStore(s => s.signIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.functions.invoke('signup-with-invite', {
        body: { email, password, fullName, inviteCode },
      })
      if (error) throw error

      await signIn(email, password)
      notifications.show({
        color: 'green',
        title: T.register.registrationSuccess,
        message: T.register.accountCreated,
      })
      // Day-one loanword-bridge onboarding (Bet-1 §3.4) instead of the dashboard.
      navigate('/welkom')
    } catch (err) {
      const code = await extractErrorCode(err)
      // 2026-07-11 prod-ready audit ("SIGNUP ENUMERATION"): the edge function
      // collapses "email already registered" and every other post-redeem
      // failure into the same generic signup_failed/500 response, so there is
      // no email_taken branch here — a distinct "that email is taken" message
      // would let an attacker probe arbitrary addresses and learn which ones
      // already have an account. invalid_invite_code stays distinct: an
      // invite-holder who mistypes their code needs that feedback, and it
      // reveals nothing about any particular email.
      const message = code === 'invalid_invite_code'
        ? T.register.invalidInviteCode
        : code === 'rate_limited'
          ? T.register.rateLimited
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
            <TextInput
              label={T.register.inviteCode}
              placeholder={T.register.inviteCodePlaceholder}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <Button type="submit" fullWidth loading={loading}>
              {T.register.createAccount}
            </Button>
          </Stack>
        </form>
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
