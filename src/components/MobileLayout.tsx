// src/components/MobileLayout.tsx
import { Outlet, NavLink } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { IconUser, IconUserFilled, IconHome, IconHomeFilled, IconBook, IconBookFilled, IconHeadphones, IconHeadphonesFilled, IconCards, IconCardsFilled, IconTrophy, IconTrophyFilled } from '@tabler/icons-react'
import classes from './MobileLayout.module.css'

const navItems = [
  { label: 'Profile', iconOutline: <IconUser size={22} />, iconFilled: <IconUserFilled size={22} />, path: '/profile' },
  { label: 'Home', iconOutline: <IconHome size={22} />, iconFilled: <IconHomeFilled size={22} />, path: '/' },
  { label: 'Lessons', iconOutline: <IconBook size={22} />, iconFilled: <IconBookFilled size={22} />, path: '/lessons' },
  { label: 'Podcasts', iconOutline: <IconHeadphones size={22} />, iconFilled: <IconHeadphonesFilled size={22} />, path: '/podcasts' },
  { label: 'Sets', iconOutline: <IconCards size={22} />, iconFilled: <IconCardsFilled size={22} />, path: '/sets' },
  { label: 'Leaderboard', iconOutline: <IconTrophy size={22} />, iconFilled: <IconTrophyFilled size={22} />, path: '/leaderboard' },
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
