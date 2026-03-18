// src/pages/Login.tsx
import { useState } from 'react'
import { TextInput, PasswordInput, Button, Paper, Title, Text, Container, Anchor } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'
import { AuthApiError } from '@supabase/supabase-js'

import { useT } from '@/hooks/useT'

export function Login() {
  const T = useT()
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((state) => state.signIn)
  const navigate = useNavigate()

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Invalid email'),
      password: (value) => (value.length < 6 ? 'Password should include at least 6 characters' : null),
    },
  })

  const handleSubmit = async (values: typeof form.values) => {
    setLoading(true)
    try {
      await signIn(values.email, values.password)
      navigate('/')
    } catch (err) {
      const msg = err instanceof AuthApiError && err.code === 'invalid_credentials'
        ? T.login.incorrectCredentials
        : T.login.somethingWentWrong
      
      notifications.show({
        color: 'red',
        title: T.login.loginFailed,
        message: msg,
      })
      
      logError({ page: 'login', action: 'signIn', error: err })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" fw={900}>
        {T.login.title}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {T.login.noAccount}{' '}
        <Anchor size="sm" component={Link} to="/register">
          {T.login.createOne}
        </Anchor>
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            label={T.login.email}
            placeholder={T.login.emailPlaceholder}
            required
            {...form.getInputProps('email')}
          />
          <PasswordInput
            label={T.login.password}
            placeholder={T.login.passwordPlaceholder}
            required
            mt="md"
            {...form.getInputProps('password')}
          />
          <Button fullWidth mt="xl" type="submit" loading={loading}>
            {T.login.logIn}
          </Button>
        </form>
      </Paper>
    </Container>
  )
}
