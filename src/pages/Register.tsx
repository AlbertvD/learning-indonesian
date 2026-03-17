// src/pages/Register.tsx
import { useState } from 'react'
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Anchor } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'

export function Register() {
  const [loading, setLoading] = useState(false)
  const signUp = useAuthStore((state) => state.signUp)
  const navigate = useNavigate()

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
      fullName: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length < 6 ? 'Password should include at least 6 characters' : null),
      fullName: (value) => (value.length < 2 ? 'Name is too short' : null),
    },
  })

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true)
    try {
      await signUp(values.email, values.password, values.fullName)
      notifications.show({
        color: 'green',
        title: 'Registration successful',
        message: 'Your account has been created. You can now log in.',
      })
      navigate('/login')
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Registration failed',
        message: 'Something went wrong. Please try again.',
      })
      logError({ page: 'register', action: 'signUp', error: err })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" fw={900}>
        Create account
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Already have an account?{' '}
        <Anchor size="sm" component={Link} to="/login">
          Log in
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label="Full Name"
            placeholder="John Doe"
            required
            {...form.getInputProps('fullName')}
          />
          <TextInput
            label="Email"
            placeholder="you@example.com"
            required
            mt="md"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            required
            mt="md"
            {...form.getInputProps('password')}
          />
          <Button fullWidth mt="xl" type="submit" loading={loading}>
            Create account
          </Button>
        </form>
      </Paper>
    </Container>
  )
}
