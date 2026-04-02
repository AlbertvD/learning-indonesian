// src/components/ProfileMenu.tsx
import { useState } from 'react'
import { Popover } from '@mantine/core'
import { Link, useNavigate } from 'react-router-dom'
import { IconUser, IconLogout } from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { logError } from '@/lib/logger'
import { notifications } from '@mantine/notifications'
import type { UserProfile } from '@/types/auth'
import classes from './ProfileMenu.module.css'

interface Props {
  initials: string
  profile: UserProfile | null
}

export function ProfileMenu({ initials, profile }: Props) {
  const [open, setOpen] = useState(false)
  const { updateLanguage, signOut } = useAuthStore()
  const navigate = useNavigate()
  const T = useT()

  const handleLang = async (lang: 'nl' | 'en') => {
    try {
      await updateLanguage(lang)
    } catch (err) {
      logError({ page: 'sidebar', action: 'updateLanguage', error: err })
      notifications.show({ color: 'red', title: T.common.error, message: T.common.somethingWentWrong })
    }
  }

  const handleSignOut = async () => {
    setOpen(false)
    await signOut()
    navigate('/login')
  }

  const currentLang = profile?.language ?? 'nl'

  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="top-start"
      offset={8}
      withArrow={false}
      shadow="xl"
      width={214}
    >
      <Popover.Target>
        <button className={classes.trigger} onClick={() => setOpen(o => !o)}>
          <div className={classes.avatar}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className={classes.name}>{profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'}</div>
            <div className={classes.meta}>A1 · Beginner</div>
          </div>
        </button>
      </Popover.Target>

      <Popover.Dropdown className={classes.dropdown}>
        {/* Header */}
        <div className={classes.header}>
          <div className={classes.avatarLg}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className={classes.fullName}>{profile?.fullName ?? profile?.email}</div>
            <div className={classes.email}>{profile?.email}</div>
          </div>
        </div>

        {/* Language switcher */}
        <div className={classes.langRow}>
          <span className={classes.langLabel}>{T.profile.language}</span>
          <div className={classes.langSwitch}>
            <button
              className={`${classes.langBtn} ${currentLang === 'nl' ? classes.langActive : ''}`}
              onClick={() => handleLang('nl')}
            >NL</button>
            <button
              className={`${classes.langBtn} ${currentLang === 'en' ? classes.langActive : ''}`}
              onClick={() => handleLang('en')}
            >EN</button>
          </div>
        </div>

        <div className={classes.divider} />

        <Link to="/profile" className={classes.menuItem} onClick={() => setOpen(false)}>
          <IconUser size={15} />
          {T.nav.profile}
        </Link>
        <button className={`${classes.menuItem} ${classes.danger}`} onClick={handleSignOut}>
          <IconLogout size={15} />
          {T.nav.logout}
        </button>
      </Popover.Dropdown>
    </Popover>
  )
}
