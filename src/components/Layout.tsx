// src/components/Layout.tsx
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Backdrop (overlay mode only) */}
      {open && !locked && (
        <div onClick={closeOverlay} style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }} />
      )}

      {/* Hamburger (shown when not locked) */}
      {!locked && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            position: 'fixed', top: 14, left: 14, zIndex: 198,
            width: 36, height: 36, borderRadius: 'var(--r-md)',
            background: colorScheme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.08)',
            border: colorScheme === 'light' ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.1)',
            color: colorScheme === 'light' ? 'var(--text-2)' : 'rgba(255,255,255,0.6)',
            boxShadow: colorScheme === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            cursor: 'pointer',
          }}
          aria-label="Open menu"
        >
          {[0,1,2].map(i => (
            <span key={i} style={{ display: 'block', width: 16, height: 1.5, background: 'currentColor', borderRadius: 2 }} />
          ))}
        </button>
      )}

      <Sidebar
        visible={sidebarVisible}
        locked={locked}
        onToggleLock={toggleLock}
        onClose={closeOverlay}
      />

      {/* Main content */}
      <main style={{
        flex: 1,
        marginLeft: locked ? 230 : 0,
        paddingLeft: locked ? 0 : 64,
        paddingRight: 24,
        transition: 'margin-left .22s cubic-bezier(.4,0,.2,1), padding-left .22s cubic-bezier(.4,0,.2,1)',
        overflowY: 'auto',
        height: '100vh',
        boxSizing: 'border-box',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
