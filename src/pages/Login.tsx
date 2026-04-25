// src/pages/Login.tsx
import { useState } from 'react'
import { Container, Paper, PasswordInput, TextInput, Button, Title, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'

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
        title: 'Login failed',
        message: 'Incorrect email or password.',
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
          <Title order={2}>Login</Title>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                disabled={loading}
                required
              />
              <PasswordInput
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                disabled={loading}
                required
              />
              <Button type="submit" fullWidth loading={loading}>
                Login
              </Button>
            </Stack>
          </form>
          <Text size="sm" c="dimmed">
            Don't have an account? <a href="/register">Sign up</a>
          </Text>
        </Stack>
      </Paper>
    </Container>
  )
}
