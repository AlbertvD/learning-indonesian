// src/pages/Login.tsx
import { useState } from 'react'
import { TextInput, PasswordInput, Anchor } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'
import { AuthApiError } from '@supabase/supabase-js'
import { useT } from '@/hooks/useT'
import classes from './Auth.module.css'

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
    <div className={classes.wrapper}>
      <div className={classes.authCard}>
        <div className={classes.logo}>
          <div className={classes.logoIcon}>BI</div>
        </div>
        <h1 className={classes.title}>{T.login.title}</h1>
        <p className={classes.subtitle}>
          {T.login.noAccount}{' '}
          <Anchor component={Link} to="/register">
            {T.login.createOne}
          </Anchor>
        </p>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <div className={classes.inputGroup}>
            <TextInput
              label={T.login.email}
              placeholder={T.login.emailPlaceholder}
              required
              {...form.getInputProps('email')}
            />
          </div>
          <div className={classes.inputGroup}>
            <PasswordInput
              label={T.login.password}
              placeholder={T.login.passwordPlaceholder}
              required
              {...form.getInputProps('password')}
            />
          </div>
          <button className={classes.btn} type="submit" disabled={loading}>
            {loading ? 'Logging in...' : T.login.logIn}
          </button>
        </form>
      </div>
    </div>
  )
}
