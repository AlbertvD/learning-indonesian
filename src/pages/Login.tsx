// src/pages/Login.tsx
import { useEffect, useState } from 'react'
import { PasswordInput, TextInput, Button, Stack, Text, Divider } from '@mantine/core'
import { IconBrandGoogle } from '@tabler/icons-react'
import { useNavigate, useSearchParams } from 'react-router'
import { notifications } from '@mantine/notifications'
import { AuthApiError } from '@supabase/supabase-js'
import { PageFormLayout } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
import { logError } from '@/lib/logger'
// Auth pages render before the user profile is loaded, so there is no
// language preference to honour yet. Dutch is the project's default UI
// language; if/when EN-first onboarding ships, swap this for a browser-
// language detection helper.
import { nl as T } from '@/lib/i18n'

// Only accept a same-app relative path — never redirect off-site from a
// query param (open-redirect guard, CRIT-1).
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const signIn = useAuthStore(s => s.signIn)
  const signInWithGoogle = useAuthStore(s => s.signInWithGoogle)
  const user = useAuthStore(s => s.user)

  // Google OAuth is a full-page redirect round trip, not a form submit — it
  // returns here (redirectTo carries the same ?next= this page was loaded
  // with) already signed in via the SIGNED_IN handler in authStore. This page
  // has no other mechanism to leave /login once that happens, so watch for
  // the store's user appearing and forward on, mirroring handleSubmit's
  // post-signIn navigation.
  useEffect(() => {
    if (user) navigate(safeNext(searchParams.get('next')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // GoTrue redirects OAuth failures back to redirectTo with an `error` query
  // param (e.g. access_denied) instead of establishing a session.
  useEffect(() => {
    const error = searchParams.get('error')
    if (!error) return
    notifications.show({
      color: 'red',
      title: T.login.loginFailed,
      message: T.login.oauthFailed,
    })
    logError({
      page: 'Login',
      action: 'oauthCallback',
      error: new Error(searchParams.get('error_description') ?? error),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await signIn(email, password)
      // ProtectedRoute carries a `?next=` param when it bounces a logged-out
      // visitor here so they land back where they were headed.
      navigate(safeNext(searchParams.get('next')))
    } catch (err) {
      // Only a genuine invalid_credentials response from GoTrue means "the
      // email/password combo is wrong" — a network/CORS/outage failure is a
      // different problem and must not be told to the learner as "wrong
      // password" (they'd keep retyping a correct password for nothing).
      //
      // email_not_confirmed is the same trap in a sharper form: the password
      // IS correct and the account DOES exist, it just has an unclicked
      // confirmation link. Reporting that as "incorrect email or password"
      // sends the learner to reset a password that was never wrong.
      const code = err instanceof AuthApiError ? err.code : undefined
      const message = code === 'email_not_confirmed'
        ? T.login.emailNotConfirmed
        : code === 'invalid_credentials'
          ? T.login.incorrectCredentials
          : T.login.somethingWentWrong
      notifications.show({
        color: 'red',
        title: T.login.loginFailed,
        message,
      })
      logError({ page: 'Login', action: 'signIn', error: err })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle(searchParams.get('next') ?? undefined)
      // On success the browser navigates away to Google immediately; no
      // further action here.
    } catch (err) {
      notifications.show({
        color: 'red',
        title: T.login.loginFailed,
        message: T.login.oauthFailed,
      })
      logError({ page: 'Login', action: 'signInWithGoogle', error: err })
      setGoogleLoading(false)
    }
  }

  return (
    <PageFormLayout title={T.login.title}>
      <Stack gap="md">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label={T.login.email}
              placeholder={T.login.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <PasswordInput
              label={T.login.password}
              placeholder={T.login.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              disabled={loading}
              required
            />
            <Button type="submit" fullWidth loading={loading}>
              {T.login.logIn}
            </Button>
          </Stack>
        </form>
        <Divider label={T.login.orDivider} labelPosition="center" />
        <Button
          variant="default"
          fullWidth
          leftSection={<IconBrandGoogle size={18} />}
          onClick={handleGoogle}
          loading={googleLoading}
        >
          {T.login.continueWithGoogle}
        </Button>
        <Text size="sm" c="dimmed">
          {T.login.noAccount} <a href="/register">{T.login.createOne}</a>
        </Text>
      </Stack>
    </PageFormLayout>
  )
}
