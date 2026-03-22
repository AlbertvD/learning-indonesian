// src/components/MobileLayout.tsx
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { IconBook, IconHeadphones, IconCards, IconTrophy, IconUser } from '@tabler/icons-react'
import classes from './MobileLayout.module.css'

const navItems = [
  { icon: <IconUser size={22} />,       path: '/profile' },
  { icon: <IconBook size={22} />,        path: '/lessons' },
  { icon: <IconHeadphones size={22} />, path: '/podcasts' },
  { icon: <IconCards size={22} />,      path: '/sets' },
  { icon: <IconTrophy size={22} />,     path: '/leaderboard' },
]

export function MobileLayout() {
  const { colorScheme } = useMantineColorScheme()
  const location = useLocation()

  return (
    <div className={`${classes.root} ${colorScheme === 'light' ? classes.light : ''}`}>
      <header className={classes.topBar}>
        <span className={classes.title}>Bahasa Indonesia</span>
      </header>

      <main className={classes.content}>
        <Outlet />
      </main>

      <nav className={classes.bottomNav}>
        {navItems.map((item) => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`${classes.navBtn} ${active ? classes.navActive : ''}`}
            >
              {item.icon}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
