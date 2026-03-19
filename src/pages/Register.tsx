// src/pages/Register.tsx
import { useState } from 'react'
import { TextInput, PasswordInput, Anchor } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { notifications } from '@mantine/notifications'
import { logError } from '@/lib/logger'
import { useT } from '@/hooks/useT'
import classes from './Auth.module.css'

export function Register() {
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
    <div className={classes.wrapper}>
      <div className={classes.authCard}>
        <div className={classes.logo}>
          <div className={classes.logoIcon}>BI</div>
        </div>
        <h1 className={classes.title}>{T.register.title}</h1>
        <p className={classes.subtitle}>
          {T.register.alreadyHaveAccount}{' '}
          <Anchor component={Link} to="/login">
            {T.register.logIn}
          </Anchor>
        </p>

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <div className={classes.inputGroup}>
            <TextInput
              label={T.register.fullName}
              placeholder={T.register.fullNamePlaceholder}
              required
              {...form.getInputProps('fullName')}
            />
          </div>
          <div className={classes.inputGroup}>
            <TextInput
              label={T.register.email}
              placeholder={T.register.emailPlaceholder}
              required
              {...form.getInputProps('email')}
            />
          </div>
          <div className={classes.inputGroup}>
            <PasswordInput
              label={T.register.password}
              placeholder={T.register.passwordPlaceholder}
              required
              {...form.getInputProps('password')}
            />
          </div>
          <button className={classes.btn} type="submit" disabled={loading}>
            {loading ? 'Creating account...' : T.register.createAccount}
          </button>
        </form>
      </div>
    </div>
  )
}
