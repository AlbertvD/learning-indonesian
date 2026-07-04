// src/components/Layout.tsx — desktop outer chrome: fixed rail + scrolling main.
//
// One mode (desktop program slice 2): the rail is always visible ≥769px. The
// pin/unpin/hamburger machinery and the `sidebar-locked` localStorage key were
// deleted with it — power users trade the full-width option for a stable frame.
import { Outlet } from 'react-router-dom'
import { useMediaQuery } from '@mantine/hooks'
import { Sidebar } from './Sidebar'
import { MobileLayout } from './MobileLayout'
import classes from './Layout.module.css'

export function Layout() {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false

  if (isMobile) return <MobileLayout />

  return (
    <div className={classes.root}>
      <Sidebar />
      <main className={classes.main}>
        <Outlet />
      </main>
    </div>
  )
}
