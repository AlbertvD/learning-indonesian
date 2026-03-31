// src/components/Sidebar.tsx
import { NavLink } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import {
  IconHome, IconBook, IconHeadphones, IconTrophy,
  IconSun, IconMoon,
} from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { ProfileMenu } from './ProfileMenu'
import classes from './Sidebar.module.css'

// Pin SVG (thumbtack)
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={13} height={13}>
    <path d="M12 17v5"/>
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>
  </svg>
)

interface SidebarProps {
  visible: boolean
  locked: boolean
  onToggleLock: () => void
  onClose: () => void
}

export function Sidebar({ visible, locked, onToggleLock, onClose }: SidebarProps) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const profile = useAuthStore(s => s.profile)
  const T = useT()

  const navItems = [
    { label: T.nav.home,         icon: <IconHome size={17} />,       path: '/' },
    { label: T.nav.lessons,      icon: <IconBook size={17} />,       path: '/lessons' },
    { label: T.nav.podcasts,     icon: <IconHeadphones size={17} />, path: '/podcasts' },
    { label: T.nav.leaderboard,  icon: <IconTrophy size={17} />,     path: '/leaderboard' },
  ]

  const initials = (profile?.fullName?.[0] ?? profile?.email?.[0] ?? 'A').toUpperCase()

  return (
    <nav className={`${classes.sidebar} ${visible ? classes.visible : ''}`}>
      {/* Logo + pin */}
      <div className={classes.logo}>
        <div className={classes.logoMark}>
          <div className={classes.logoName}>Bahasa Indonesia</div>
          <button
            className={`${classes.pinBtn} ${locked ? classes.pinLocked : ''}`}
            onClick={onToggleLock}
            title={locked ? 'Unlock sidebar' : 'Lock sidebar'}
          >
            <PinIcon />
          </button>
        </div>
      </div>

      {/* Nav */}
      <div className={classes.nav}>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `${classes.navItem} ${isActive ? classes.navActive : ''}`}
            onClick={() => { if (!locked) onClose() }}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* User footer */}
      <div className={classes.userFooter}>
        <ProfileMenu initials={initials} profile={profile} />
        <button
          className={classes.themeBtn}
          onClick={toggleColorScheme}
          title="Toggle theme"
        >
          {colorScheme === 'dark'
            ? <IconSun size={14} />
            : <IconMoon size={14} />}
        </button>
      </div>
    </nav>
  )
}
