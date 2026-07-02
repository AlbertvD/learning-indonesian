// src/pages/Login.tsx
import { useState } from 'react'
import { PasswordInput, TextInput, Button, Stack, Text } from '@mantine/core'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { PageFormLayout } from '@/components/page/primitives'
import { useAuthStore } from '@/stores/authStore'
// Auth pages render before the user profile is loaded, so there is no
// language preference to honour yet. Dutch is the project's default UI
// language; if/when EN-first onboarding ships, swap this for a browser-
// language detection helper.
import { nl as T } from '@/lib/i18n'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const signIn = useAuthStore(s => s.signIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await signIn(email, password)
      // ProtectedRoute carries a `?next=` param when it bounces a logged-out
      // visitor here so they land back where they were headed. Only accept a
      // same-app relative path — never redirect off-site from a query param.
      const next = searchParams.get('next')
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/')
    } catch {
      notifications.show({
        color: 'red',
        title: T.login.loginFailed,
        message: T.login.incorrectCredentials,
      })
    } finally {
      setLoading(false)
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
        <Text size="sm" c="dimmed">
          {T.login.noAccount} <a href="/register">{T.login.createOne}</a>
        </Text>
      </Stack>
    </PageFormLayout>
  )
}
