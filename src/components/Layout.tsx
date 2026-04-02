// src/components/Layout.tsx
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconMenu2 } from '@tabler/icons-react'
import { Sidebar } from './Sidebar'
import { MobileLayout } from './MobileLayout'

const SIDEBAR_LOCKED_KEY = 'sidebar-locked'

export function Layout() {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  const { colorScheme } = useMantineColorScheme()
  const [locked, setLocked] = useState(
    () => localStorage.getItem(SIDEBAR_LOCKED_KEY) !== 'false'
  )
  const [open, setOpen] = useState(false)

  const toggleLock = () => {
    setLocked(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_LOCKED_KEY, String(next))
      if (next) setOpen(false)
      return next
    })
  }

  const closeOverlay = () => setOpen(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (isMobile) return <MobileLayout />

  const sidebarVisible = locked || open

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Backdrop (overlay mode only) */}
      {open && !locked && (
        <div onClick={closeOverlay} style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }} />
      )}

      {/* Hamburger button (toggle sidebar lock) */}
      <div style={{ position: 'fixed', left: 14, top: 14, zIndex: 198 }}>
        <button
          onClick={toggleLock}
          style={{
            width: 36, height: 36, borderRadius: 'var(--r-md)',
            background: colorScheme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.08)',
            border: colorScheme === 'light' ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.1)',
            color: colorScheme === 'light' ? 'var(--text-2)' : 'rgba(255,255,255,0.6)',
            boxShadow: colorScheme === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label="Toggle sidebar"
        >
          <IconMenu2 size={20} />
        </button>
      </div>

      <Sidebar
        visible={sidebarVisible}
        locked={locked}
        onToggleLock={toggleLock}
        onClose={closeOverlay}
      />

      {/* Main content */}
      <main style={{
        flex: 1,
        paddingLeft: locked ? 230 : 64,
        paddingRight: 24,
        transition: 'padding-left .22s cubic-bezier(.4,0,.2,1)',
        overflow: 'auto',
        height: '100vh',
        boxSizing: 'border-box',
        minWidth: 0,
      }}>
        <Outlet />
      </main>
    </div>
  )
}
