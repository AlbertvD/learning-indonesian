// src/components/MobileLayout.tsx
import { Outlet, NavLink } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { IconBook, IconHeadphones, IconCards, IconTrophy, IconUser, IconHome } from '@tabler/icons-react'
import classes from './MobileLayout.module.css'

const navItems = [
  { icon: <IconUser size={22} />,       path: '/profile' },
  { icon: <IconHome size={22} />,       path: '/' },
  { icon: <IconBook size={22} />,        path: '/lessons' },
  { icon: <IconHeadphones size={22} />, path: '/podcasts' },
  { icon: <IconCards size={22} />,      path: '/sets' },
  { icon: <IconTrophy size={22} />,     path: '/leaderboard' },
]

export function MobileLayout() {
  const { colorScheme } = useMantineColorScheme()

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
            {item.icon}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
