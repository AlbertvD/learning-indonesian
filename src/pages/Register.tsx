// src/pages/Register.tsx
import { useState } from 'react'
import { Container, Paper, PasswordInput, TextInput, Button, Title, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { nl as T } from '@/lib/i18n'

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const signUp = useAuthStore(s => s.signUp)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await signUp(email, password, fullName)
      notifications.show({
        color: 'green',
        title: T.register.registrationSuccess,
        message: T.register.accountCreated,
      })
      navigate('/login')
    } catch {
      notifications.show({
        color: 'red',
        title: T.register.registrationFailed,
        message: T.register.somethingWentWrong,
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
          <Title order={2}>{T.register.title}</Title>
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
          <Text size="sm" c="dimmed">
            {T.register.alreadyHaveAccount} <a href="/login">{T.register.logIn}</a>
          </Text>
        </Stack>
      </Paper>
    </Container>
  )
}
