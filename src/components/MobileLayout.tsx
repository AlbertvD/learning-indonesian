// src/components/MobileLayout.tsx
import { Outlet, NavLink } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { IconUser, IconUserFilled, IconHome, IconHomeFilled, IconBook, IconBookFilled, IconCompass, IconCompassFilled, IconChartBar, IconChartBarPopular } from '@tabler/icons-react'
import { useT } from '@/hooks/useT'
import classes from './MobileLayout.module.css'

export function MobileLayout() {
  const { colorScheme } = useMantineColorScheme()
  const T = useT()
  // Five primary destinations (foundation plan §7.1): Home · Leren · Ontdek ·
  // Voortgang · Profiel. Grouping is by what the learner does, not content type.
  const navItems = [
    { label: T.nav.home, iconOutline: <IconHome size={22} />, iconFilled: <IconHomeFilled size={22} />, path: '/' },
    { label: T.nav.leren, iconOutline: <IconBook size={22} />, iconFilled: <IconBookFilled size={22} />, path: '/leren' },
    { label: T.nav.ontdek, iconOutline: <IconCompass size={22} />, iconFilled: <IconCompassFilled size={22} />, path: '/ontdek' },
    { label: T.nav.progress, iconOutline: <IconChartBar size={22} />, iconFilled: <IconChartBarPopular size={22} />, path: '/progress' },
    { label: T.nav.profile, iconOutline: <IconUser size={22} />, iconFilled: <IconUserFilled size={22} />, path: '/profile' },
  ]

  return (
    <div className={`${classes.root} ${colorScheme === 'light' ? classes.light : ''}`}>
      <header className={classes.topBar}>
        <span className={classes.title}>Bahasa Indonesia</span>
      </header>

      <main className={classes.content}>
        <Outlet />
      </main>

      <nav className={classes.bottomNav}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `${classes.navBtn} ${isActive ? classes.navActive : ''}`}
          >
            {({ isActive }) => (
              <div className={classes.navBtnContent}>
                {isActive ? item.iconFilled : item.iconOutline}
                <span className={classes.navLabel}>{item.label}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
