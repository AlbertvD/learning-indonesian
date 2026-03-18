// src/pages/Register.tsx
import { useState } from 'react'
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Anchor } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'

import { useT } from '@/hooks/useT'

export function Register() {
  // useT() returns 'nl' here because profile is null for unauthenticated users.
  // This is intentional — login/register pages are always in Dutch.
  // Do not add a localStorage fallback; language preference is a per-account setting.
  const T = useT()
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
        title: T.register.registrationSuccess,
        message: T.register.accountCreated,
      })
      navigate('/login')
    } catch (err) {
      notifications.show({
        color: 'red',
        title: T.register.registrationFailed,
        message: T.register.somethingWentWrong,
      })
      logError({ page: 'register', action: 'signUp', error: err })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" fw={900}>
        {T.register.title}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {T.register.alreadyHaveAccount}{' '}
        <Anchor size="sm" component={Link} to="/login">
          {T.register.logIn}
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label={T.register.fullName}
            placeholder={T.register.fullNamePlaceholder}
            required
            {...form.getInputProps('fullName')}
          />
          <TextInput
            label={T.register.email}
            placeholder={T.register.emailPlaceholder}
            required
            mt="md"
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label={T.register.password}
            placeholder={T.register.passwordPlaceholder}
            required
            mt="md"
            {...form.getInputProps('password')}
          />
          <Button fullWidth mt="xl" type="submit" loading={loading}>
            {T.register.createAccount}
          </Button>
        </form>
      </Paper>
    </Container>
  )
}
