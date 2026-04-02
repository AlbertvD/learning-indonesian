# UI Redesign Implementation Plan

> **Status:** ✅ COMPLETED (2026-03-28)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current Mantine AppShell layout and generic styling with the glassmorphism dark/light design from the HTML mockup (`docs/mockups/ui-mockup.html`).

**Architecture:** Drop the Mantine AppShell entirely in favour of a custom `div`-based layout. The sidebar is `position: fixed`, slides in/out, and can be pinned open (persisted to localStorage). All design tokens live in `src/index.css` as CSS custom properties; Mantine components inherit them via the theme. Page components are restyled in place — no new pages added.

**Tech Stack:** React 19, Mantine v8, Tabler Icons, Google Fonts (Poppins + Open Sans), CSS custom properties, Zustand (existing), React Router 7

**Reference:** `docs/mockups/ui-mockup.html` — read this file for exact CSS values, colours, and component patterns at any step where exact values are needed.

---

## Task 1: Fonts + Design Tokens

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/main.tsx`

### Step 1: Add Google Fonts to index.html

Add before `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=Open+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### Step 2: Rewrite src/index.css

Replace the entire file with the design token system. Copy the `:root` block, dark/light mode variables, atmospheric background, and utility CSS exactly from the mockup. Key sections:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* Dark theme (default) */
  --bg:     #0b0b10;
  --surf-1: #111118;
  --surf-2: #18181f;
  --surf-3: #1f1f29;
  --surf-4: #28283c;
  --border:       #28283c;
  --border-light: #34344e;

  --purple:        #8b6cf5;
  --purple-dim:    #6b50cc;
  --purple-bright: #a78bfa;
  --purple-glow:   rgba(139,108,245,0.16);
  --purple-subtle: rgba(139,108,245,0.09);
  --teal:         #3ecfbf;
  --teal-subtle:  rgba(62,207,191,0.10);
  --success:         #4eca7a;
  --success-subtle:  rgba(78,202,122,0.10);
  --danger:          #f06969;
  --danger-subtle:   rgba(240,105,105,0.10);
  --warning:         #f0a940;
  --warning-subtle:  rgba(240,169,64,0.10);

  --text-1: #eeedf6;
  --text-2: #9490aa;
  --text-3: #55517a;

  --display: 'Poppins', system-ui, sans-serif;
  --sans:    'Open Sans', system-ui, sans-serif;

  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 16px;
  --r-xl: 24px;
}

html, body {
  background:
    radial-gradient(ellipse 75% 55% at 85% 5%,  rgba(139,108,245,0.18) 0%, transparent 55%),
    radial-gradient(ellipse 55% 45% at 5%  90%,  rgba(62,207,191,0.10)  0%, transparent 55%),
    radial-gradient(ellipse 90% 50% at 50% 115%, rgba(90,30,140,0.25)   0%, transparent 60%),
    var(--bg);
  color: var(--text-1);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.65;
  min-height: 100vh;
}

/* Light theme — toggled via html[data-mantine-color-scheme="light"] */
html[data-mantine-color-scheme="light"] {
  --bg:           #eef5ff;
  --surf-1:       #ffffff;
  --surf-2:       #e4f0ff;
  --surf-3:       #d5e8ff;
  --surf-4:       #c2d9f8;
  --border:       #ccdff5;
  --border-light: #b5cff0;
  --text-1:       #0d1f3c;
  --text-2:       #3a5882;
  --text-3:       #7a99c0;
  --purple:       #5b6ef5;
  --purple-dim:   #4a5be0;
  --purple-bright:#6e80ff;
  --purple-subtle: rgba(91,110,245,0.08);
  --teal:         #1ab8a8;
  --teal-subtle:  rgba(26,184,168,0.10);
  --success:      #1fa85a;
  --success-subtle: rgba(31,168,90,0.10);
  --danger:       #d94040;
  --danger-subtle: rgba(217,64,64,0.10);
  --warning:      #d48a10;
  --warning-subtle: rgba(212,138,16,0.10);
}

html[data-mantine-color-scheme="light"] body {
  background:
    radial-gradient(ellipse 70% 50% at 85% 5%,  rgba(120,160,255,0.18) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 5%  90%,  rgba(26,184,168,0.10)  0%, transparent 55%),
    radial-gradient(ellipse 80% 45% at 50% 120%, rgba(91,110,245,0.12)  0%, transparent 60%),
    var(--bg);
}

#root {
  min-height: 100vh;
}
```

> **Note:** Mantine v8 sets `data-mantine-color-scheme="light"|"dark"` on `<html>` — use this attribute selector instead of a custom class.

### Step 3: Update src/main.tsx theme

```typescript
const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily: "'Open Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'Courier New', monospace",
  headings: { fontFamily: "'Poppins', system-ui, sans-serif" },
})
```

### Step 4: Commit
```bash
git add index.html src/index.css src/main.tsx
git commit -m "feat: add design tokens, Poppins/Open Sans fonts, dark/light CSS vars"
```

---

## Task 2: Custom Layout Shell

Replace the Mantine AppShell entirely. The new layout is a full-viewport `div` with a fixed sidebar and a scrollable main area.

**Files:**
- Modify: `src/components/Layout.tsx` (full rewrite)

### Step 1: Rewrite Layout.tsx

The layout renders `<Sidebar>` (built in Task 3) and a `<main>` element. Sidebar pin state comes from localStorage. The hamburger button and backdrop live here.

```tsx
// src/components/Layout.tsx
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

const SIDEBAR_LOCKED_KEY = 'sidebar-locked'

export function Layout() {
  const [locked, setLocked] = useState(
    () => localStorage.getItem(SIDEBAR_LOCKED_KEY) !== 'false'
  )
  const [open, setOpen] = useState(false)

  const toggleLock = () => {
    setLocked(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_LOCKED_KEY, String(next))
      if (next) setOpen(false) // overlay no longer needed
      return next
    })
  }

  // Close overlay when clicking backdrop
  const closeOverlay = () => setOpen(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
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
        transition: 'margin-left .22s cubic-bezier(.4,0,.2,1)',
        overflowY: 'auto',
        height: '100vh',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
```

### Step 2: Commit
```bash
git add src/components/Layout.tsx
git commit -m "feat: replace AppShell with custom fixed-sidebar layout"
```

---

## Task 3: Sidebar Component

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/ProfileMenu.tsx`

### Step 1: Create src/components/Sidebar.tsx

```tsx
// src/components/Sidebar.tsx
import { useLocation, Link } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import {
  IconBook, IconHeadphones, IconCards, IconTrophy,
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
  const location = useLocation()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const profile = useAuthStore(s => s.profile)
  const T = useT()

  const navItems = [
    { label: T.nav.lessons,      icon: <IconBook size={17} />,       path: '/lessons' },
    { label: T.nav.podcasts,     icon: <IconHeadphones size={17} />, path: '/podcasts' },
    { label: T.nav.flashcards,   icon: <IconCards size={17} />,      path: '/cards' },
    { label: T.nav.leaderboard,  icon: <IconTrophy size={17} />,     path: '/leaderboard' },
  ]

  const initials = (profile?.fullName?.[0] ?? profile?.email?.[0] ?? 'A').toUpperCase()

  return (
    <nav className={`${classes.sidebar} ${visible ? classes.visible : ''}`}>
      {/* Logo + pin */}
      <div className={classes.logo}>
        <div className={classes.logoMark}>
          <div className={classes.logoIcon}>BI</div>
          <div>
            <div className={classes.logoName}>Bahasa Indonesia</div>
            <div className={classes.logoSub}>Language Course</div>
          </div>
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
        {navItems.map(item => {
          const active = location.pathname.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`${classes.navItem} ${active ? classes.navActive : ''}`}
              onClick={() => { if (!locked) onClose() }}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
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
```

### Step 2: Create src/components/Sidebar.module.css

Copy sidebar CSS from the mockup, converting class names. Key styles:

```css
.sidebar {
  position: fixed; left: 0; top: 0; bottom: 0; z-index: 200;
  width: 230px;
  background: rgba(11,11,18,0.75);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid rgba(255,255,255,0.05);
  display: flex; flex-direction: column;
  transform: translateX(-100%);
  transition: transform .22s cubic-bezier(.4,0,.2,1);
}
.visible { transform: translateX(0); }

/* Logo area */
.logo { padding: 22px 18px 18px; border-bottom: 1px solid rgba(255,255,255,0.05); }
.logoMark { display: flex; align-items: center; gap: 10px; }
.logoIcon {
  width: 36px; height: 36px; border-radius: var(--r-md);
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-size: 14px; font-weight: 900; color: #fff;
  flex-shrink: 0;
}
.logoName { font-family: var(--display); font-size: 15px; font-weight: 800; color: var(--text-1); line-height: 1.2; }
.logoSub  { font-family: var(--display); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-top: 2px; }

/* Pin button */
.pinBtn {
  margin-left: auto; flex-shrink: 0;
  width: 28px; height: 28px; border-radius: var(--r-sm);
  background: transparent; border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.pinBtn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.15); }
.pinLocked { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.15); }
.pinLocked svg { transform: rotate(-45deg); }

/* Nav */
.nav { padding: 10px 8px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
.navItem {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 11px; border-radius: var(--r-md);
  color: var(--text-2); font-family: var(--display); font-size: 14px; font-weight: 600;
  text-decoration: none; transition: all .15s;
}
.navItem:hover { background: rgba(255,255,255,0.05); color: var(--text-1); }
.navActive { background: rgba(255,255,255,0.08); color: #fff; }
.navItem svg { width: 17px; height: 17px; flex-shrink: 0; opacity: .45; }
.navActive svg { opacity: 1; }

/* User footer */
.userFooter {
  padding: 14px 16px;
  border-top: 1px solid rgba(255,255,255,0.05);
  display: flex; align-items: center; gap: 10px;
}

/* Theme toggle button */
.themeBtn {
  flex-shrink: 0; width: 30px; height: 30px; border-radius: var(--r-md);
  background: transparent; border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.themeBtn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8); }

/* ── Light theme overrides ── */
:global(html[data-mantine-color-scheme="light"]) .sidebar {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(24px);
  border-right-color: var(--border);
}
:global(html[data-mantine-color-scheme="light"]) .logo { border-bottom-color: var(--border); }
:global(html[data-mantine-color-scheme="light"]) .logoSub { color: var(--text-3); }
:global(html[data-mantine-color-scheme="light"]) .logoIcon { background: rgba(91,110,245,0.10); border-color: rgba(91,110,245,0.2); color: var(--purple); }
:global(html[data-mantine-color-scheme="light"]) .navItem { color: var(--text-2); }
:global(html[data-mantine-color-scheme="light"]) .navItem:hover { background: rgba(91,110,245,0.07); color: var(--text-1); }
:global(html[data-mantine-color-scheme="light"]) .navActive { background: rgba(91,110,245,0.12); color: var(--purple); }
:global(html[data-mantine-color-scheme="light"]) .navActive svg { opacity: 1; }
:global(html[data-mantine-color-scheme="light"]) .pinBtn { border-color: var(--border); color: var(--text-3); }
:global(html[data-mantine-color-scheme="light"]) .pinBtn:hover { background: rgba(91,110,245,0.08); color: var(--purple); border-color: rgba(91,110,245,0.2); }
:global(html[data-mantine-color-scheme="light"]) .pinLocked { color: var(--purple); border-color: rgba(91,110,245,0.25); }
:global(html[data-mantine-color-scheme="light"]) .userFooter { border-top-color: var(--border); }
:global(html[data-mantine-color-scheme="light"]) .themeBtn { border-color: var(--border); color: var(--text-3); }
:global(html[data-mantine-color-scheme="light"]) .themeBtn:hover { background: rgba(91,110,245,0.08); color: var(--purple); }
```

### Step 3: Commit
```bash
git add src/components/Sidebar.tsx src/components/Sidebar.module.css
git commit -m "feat: add Sidebar component with pin/lock and slide animation"
```

---

## Task 4: Profile Menu Component

**Files:**
- Create: `src/components/ProfileMenu.tsx`
- Create: `src/components/ProfileMenu.module.css`

### Step 1: Create ProfileMenu.tsx

This is a button (the avatar + name) that opens a Mantine `Popover` above it, containing user info, language switcher, profile link, and sign out.

```tsx
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
          <div>
            <div className={classes.name}>{profile?.fullName?.split(' ')[0] ?? profile?.email ?? 'User'}</div>
            <div className={classes.meta}>A1 · Beginner</div>
          </div>
        </button>
      </Popover.Target>

      <Popover.Dropdown className={classes.dropdown}>
        {/* Header */}
        <div className={classes.header}>
          <div className={classes.avatarLg}>{initials}</div>
          <div>
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
```

### Step 2: Create ProfileMenu.module.css

```css
.trigger {
  display: flex; align-items: center; gap: 10px; flex: 1;
  background: transparent; border: none; cursor: pointer;
  border-radius: var(--r-md); padding: 2px 4px 2px 0;
  transition: background .15s; min-width: 0; text-align: left;
}
.trigger:hover { background: rgba(255,255,255,0.05); }

.avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-size: 13px; font-weight: 900; color: #fff;
  flex-shrink: 0;
}
.name { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text-1); line-height: 1.3; }
.meta { font-size: 11px; color: var(--text-3); }

/* Dropdown */
.dropdown {
  background: rgba(20,20,28,0.96) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: var(--r-lg) !important;
  padding: 6px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}

.header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  margin-bottom: 4px;
}
.avatarLg {
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--display); font-size: 15px; font-weight: 900; color: #fff;
  flex-shrink: 0;
}
.fullName { font-family: var(--display); font-size: 13px; font-weight: 700; color: var(--text-1); }
.email    { font-size: 11px; color: var(--text-3); margin-top: 1px; }

/* Language row */
.langRow {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px;
}
.langLabel { font-size: 12px; color: var(--text-3); }
.langSwitch {
  display: flex;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--r-sm); overflow: hidden;
}
.langBtn {
  padding: 4px 8px; font-family: var(--display); font-size: 10px; font-weight: 700;
  letter-spacing: .04em; color: rgba(255,255,255,0.35);
  background: transparent; border: none; cursor: pointer; transition: all .15s;
}
.langActive { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.9); }

.divider { height: 1px; background: rgba(255,255,255,0.07); margin: 4px 0; }

.menuItem {
  display: flex; align-items: center; gap: 9px;
  padding: 8px 10px; border-radius: var(--r-md);
  font-family: var(--display); font-size: 13px; font-weight: 600; color: var(--text-2);
  cursor: pointer; transition: background .12s;
  text-decoration: none; border: none; background: transparent; width: 100%;
}
.menuItem:hover { background: rgba(255,255,255,0.06); color: var(--text-1); }
.danger { color: var(--danger); }
.danger:hover { background: var(--danger-subtle); }
.menuItem svg { opacity: .7; flex-shrink: 0; }

/* Light theme */
:global(html[data-mantine-color-scheme="light"]) .trigger:hover { background: rgba(91,110,245,0.06); }
:global(html[data-mantine-color-scheme="light"]) .avatar { background: rgba(91,110,245,0.12); border-color: rgba(91,110,245,0.2); color: var(--purple); }
:global(html[data-mantine-color-scheme="light"]) .avatarLg { background: rgba(91,110,245,0.12); border-color: rgba(91,110,245,0.2); color: var(--purple); }
:global(html[data-mantine-color-scheme="light"]) .dropdown {
  background: rgba(255,255,255,0.97) !important;
  border-color: var(--border) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.10) !important;
}
:global(html[data-mantine-color-scheme="light"]) .header { border-bottom-color: var(--border); }
:global(html[data-mantine-color-scheme="light"]) .divider { background: var(--border); }
:global(html[data-mantine-color-scheme="light"]) .langSwitch { background: rgba(91,110,245,0.06); border-color: var(--border); }
:global(html[data-mantine-color-scheme="light"]) .langBtn { color: var(--text-3); }
:global(html[data-mantine-color-scheme="light"]) .langActive { background: rgba(91,110,245,0.14); color: var(--purple); }
:global(html[data-mantine-color-scheme="light"]) .menuItem:hover { background: rgba(91,110,245,0.06); }
```

### Step 3: Commit
```bash
git add src/components/ProfileMenu.tsx src/components/ProfileMenu.module.css
git commit -m "feat: add ProfileMenu with language switcher and sign out"
```

---

## Task 5: Hamburger Button — Light Theme

The hamburger button is inline in `Layout.tsx`. Add a light-theme style by checking `colorScheme` from Mantine:

**Files:**
- Modify: `src/components/Layout.tsx`

### Step 1: Update hamburger to use colorScheme-aware styles

Import `useMantineColorScheme` and apply different inline styles based on light/dark:
```tsx
const { colorScheme } = useMantineColorScheme()
// then in the button style:
style={{
  ...
  background: colorScheme === 'light' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.08)',
  border: colorScheme === 'light' ? '1px solid var(--border)' : '1px solid rgba(255,255,255,0.1)',
  color: colorScheme === 'light' ? 'var(--text-2)' : 'rgba(255,255,255,0.6)',
  boxShadow: colorScheme === 'light' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
}}
```

### Step 2: Commit
```bash
git add src/components/Layout.tsx
git commit -m "feat: hamburger button adapts to light/dark theme"
```

---

## Task 6: Dashboard Page

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Create: `src/pages/Dashboard.module.css`

### Step 1: Rewrite Dashboard.tsx

Replace Mantine `SimpleGrid`, `Card`, `Button` with custom CSS classes matching the mockup's stat-grid, stat-card, continue-card, and quick-action button patterns. Keep all data-fetching logic unchanged.

Key layout structure from mockup:
- Display heading: `Selamat pagi, [Name].` (or welcome back text from i18n)
- Stat grid (3 cols): Lessons Done · Cards Due · Level
- Section label + Continue card (clickable, goes to `/lessons`)
- Section label + Quick action buttons

```tsx
// stat card:
<div className={classes.statCard}>
  <div className={classes.statLabel}>{T.dashboard.lessonsCompleted}</div>
  <div className={classes.statValue}>{lessonsCompletedCount}</div>
</div>
```

For the display heading, use a large Poppins heading instead of Mantine `Title`. Keep all existing state and fetch logic intact.

### Step 2: Create Dashboard.module.css

Copy stat-card, continue-card, and quick-action button CSS from the mockup. Key classes: `.grid`, `.statCard`, `.statLabel`, `.statValue`, `.statSub`, `.continueCard`, `.continueIcon`, `.sectionLabel`, `.actions`.

Stat card glass pattern:
```css
.statCard {
  background: rgba(24,24,31,0.30);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--r-lg); padding: 22px 20px;
  position: relative; overflow: hidden;
}
.statCard::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
}
.statCard.purple::after { background: linear-gradient(90deg, var(--purple), transparent); }
.statCard.orange::after { background: linear-gradient(90deg, var(--warning), transparent); }
.statCard.teal::after   { background: linear-gradient(90deg, var(--teal), transparent); }
```

Include light-theme overrides.

### Step 3: Commit
```bash
git add src/pages/Dashboard.tsx src/pages/Dashboard.module.css
git commit -m "feat: redesign Dashboard with stat cards and continue card"
```

---

## Task 7: Lessons List Page

**Files:**
- Modify: `src/pages/Lessons.tsx`
- Create: `src/pages/Lessons.module.css`

### Step 1: Rewrite Lessons.tsx layout

Replace Mantine cards with the lesson-grid 2-column layout from the mockup. Keep all data fetching unchanged. Key elements:
- Page title + label
- 2-col grid of lesson cards
- Each card: large lesson number watermark, title, subtitle, badges, arrow
- Completed lessons: green left-border indicator

```tsx
<div className={classes.lessonGrid}>
  {lessons.map((lesson, i) => (
    <Link key={lesson.id} to={`/lesson/${lesson.id}`} className={`${classes.lessonCard} ${isDone ? classes.done : ''}`}>
      <div className={classes.lessonNum}>{String(i + 1).padStart(2, '0')}</div>
      <div className={classes.lessonTitle}>{lesson.title}</div>
      ...
    </Link>
  ))}
</div>
```

### Step 2: Create Lessons.module.css

Copy lesson-grid and lesson-card CSS from mockup including hover effects, done state, lesson-num watermark, and light-theme overrides.

### Step 3: Commit
```bash
git add src/pages/Lessons.tsx src/pages/Lessons.module.css
git commit -m "feat: redesign Lessons list with new card grid"
```

---

## Task 8: Lesson Content Page

**Files:**
- Modify: `src/pages/Lesson.tsx`
- Create: `src/pages/Lesson.module.css`

### Step 1: Update Lesson.tsx

Replace the Mantine `Table`-based `SectionContent` with custom components styled per the mockup:
- **Exercises**: phrase-row grid (Indonesian large, phonetic small, Dutch right)
- **Text**: phrase-list for examples, spelling-grid chips, sentence-row for simple sentences
- **Grammar**: grammar-category + grammar-rule with bullet dots
- **Dialogue**: dialogue-line with speaker badge + text

Replace the outer card (`Paper`) with a custom `.contentCard` glass panel. Replace the progress `Progress` component with custom progress dots or bar. Replace navigation buttons with styled custom buttons.

Keep the audio player using native `<audio>` element wrapped in the `.audioPlayer` card.

### Step 2: Create Lesson.module.css

Copy all lesson-content CSS from mockup: `.phraseRow`, `.phraseIndo`, `.phrasePhonetic`, `.phraseDutch`, `.spellingGrid`, `.spellingChip`, `.grammarCategory`, `.grammarRule`, `.dialogueLine`, `.dialogueSpeaker`, `.dialogueText`, `.audioPlayer`, `.lessonNav`, `.progressDots`, `.dot`, `.contentCard`.

Include light-theme overrides for all.

### Step 3: Commit
```bash
git add src/pages/Lesson.tsx src/pages/Lesson.module.css
git commit -m "feat: redesign Lesson content with phrase rows, grammar, dialogue styles"
```

---

## Task 9: Review (Flashcard) Page

**Files:**
- Modify: `src/pages/Review.tsx`
- Create: `src/pages/Review.module.css`

### Step 1: Update Review.tsx

Replace the Mantine `Paper` card and `Button` rating buttons with custom classes:
- `.reviewCard` — large glass card, centered word
- `.reviewFront` — big Poppins display text (44px weight 500)
- `.reviewDivider` — thin line separating front from back
- `.reviewBack` — smaller, dimmer translation
- `.ratingGrid` — 4-column button grid
- `.rb-again`, `.rb-hard`, `.rb-good`, `.rb-easy` — coloured rating buttons with interval label

The empty-state and session-done screens also get the glassmorphism card treatment.

### Step 2: Create Review.module.css

Copy review-card and rating-btn CSS from mockup, including hover states and light-theme overrides.

### Step 3: Commit
```bash
git add src/pages/Review.tsx src/pages/Review.module.css
git commit -m "feat: redesign Review page with new flashcard and rating button styles"
```

---

## Task 10: Clean Up

**Files:**
- Modify: `src/index.css` — remove any leftover legacy rules that conflict
- Modify: `src/App.css` — check for conflicting layout styles, remove if needed
- Check: Login and Register pages still look reasonable (they are outside Layout, so no sidebar — just centred forms on the atmospheric background)

### Step 1: Visual QA checklist

Open the running app (`bun run dev`) and check each page:
- [ ] Dark mode: sidebar locked, all pages render cleanly
- [ ] Light mode: toggle works, colours correct
- [ ] Sidebar: unlock → hamburger appears, click hamburger → overlay opens, backdrop click → closes
- [ ] Profile menu: opens above footer, language switch updates all text immediately
- [ ] Dashboard: stat cards, continue card, quick actions
- [ ] Lessons: 2-col grid, lesson numbers, completed state
- [ ] Lesson: phrase rows, grammar rules, dialogue lines, audio player
- [ ] Review: card displays, answer reveal, rating buttons
- [ ] Login / Register: forms centered on atmospheric background, no sidebar

### Step 2: Final commit
```bash
git add -A
git commit -m "feat: complete UI redesign — glassmorphism dark/light theme"
```

---

## Supabase Requirements

N/A — this is a pure frontend styling change. No schema, RLS, storage, or homelab-configs changes required.
