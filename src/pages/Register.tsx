// src/pages/Register.tsx
import { useState } from 'react'
import { Container, Paper, PasswordInput, TextInput, Button, Title, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'

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
        title: 'Account created',
        message: 'You can now log in with your credentials.',
      })
      navigate('/login')
    } catch {
      notifications.show({
        color: 'red',
        title: 'Registration failed',
        message: 'Could not create account. Email might already exist.',
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
          <Title order={2}>Create Account</Title>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Full Name"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.currentTarget.value)}
                disabled={loading}
                required
              />
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
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                disabled={loading}
                required
              />
              <Button type="submit" fullWidth loading={loading}>
                Create Account
              </Button>
            </Stack>
          </form>
          <Text size="sm" c="dimmed">
            Already have an account? <a href="/login">Log in</a>
          </Text>
        </Stack>
      </Paper>
    </Container>
  )
}
