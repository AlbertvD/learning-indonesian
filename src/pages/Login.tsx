// src/pages/Login.tsx
import { useState } from 'react'
import { Container, Paper, PasswordInput, TextInput, Button, Title, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { nl as T } from '@/lib/i18n'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const signIn = useAuthStore(s => s.signIn)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await signIn(email, password)
      navigate('/')
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
    // eslint-disable-next-line no-restricted-syntax -- TODO(page-framework Phase 6): migrate to <PageFormLayout>
    <Container size="xs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Paper p="lg" radius="md" shadow="md" style={{ width: '100%' }}>
        <Stack gap="md">
          <Title order={2}>{T.login.title}</Title>
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
      </Paper>
    </Container>
  )
}
