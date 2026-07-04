// src/components/Sidebar.tsx — the persistent deep-green rail (desktop program
// slice 2, docs/plans/2026-07-03-desktop-program-design.md §Slice 2).
//
// Always visible ≥769px, identical in both themes (the brand constant). Top to
// bottom: Kamoe Bisa wordmark · "Start sessie" CTA · the five destinations
// (Home · Leren · Ontdek · Voortgang · Profiel, foundation plan §7.1) · admin
// links (admins only) · a footer glance (streak + today's goal → Home) with
// the theme toggle. The old footer ProfileMenu is deleted — language, profile
// and sign-out all live on the Profiel page.
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMantineColorScheme } from '@mantine/core'
import {
  IconHome, IconBook, IconCompass, IconChartBar, IconUser,
  IconLayoutList, IconBolt, IconEye,
  IconSun, IconMoon, IconFlame, IconPlayerPlayFilled,
} from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import { engagement } from '@/lib/analytics/engagement'
import { SunMark } from './SunMark'
import classes from './Sidebar.module.css'

interface Glance {
  streakDays: number
  minutesToday: number
}

export function Sidebar() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const user = useAuthStore(s => s.user)
  const profile = useAuthStore(s => s.profile)
  const T = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [glance, setGlance] = useState<Glance | null>(null)

  // Streak + today's-goal glance — the same engagement read Home does. Re-read
  // on route change so finishing a session (recap → navigate) refreshes it.
  // Decorative: on failure it simply stays hidden.
  useEffect(() => {
    let cancelled = false
    if (!user) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    engagement
      .practiceTime(user.id, tz)
      .then(pt => {
        if (!cancelled) setGlance({ streakDays: pt.streakDays, minutesToday: pt.minutesToday })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user, pathname])

  const navItems = [
    { label: T.nav.home,     icon: <IconHome size={18} />,     path: '/' },
    { label: T.nav.leren,    icon: <IconBook size={18} />,     path: '/leren' },
    { label: T.nav.ontdek,   icon: <IconCompass size={18} />,  path: '/ontdek' },
    { label: T.nav.progress, icon: <IconChartBar size={18} />, path: '/progress' },
    { label: T.nav.profile,  icon: <IconUser size={18} />,     path: '/profile' },
  ]

  // Dev/coverage + review surfaces sit behind admin, not in the primary nav.
  const adminItems = profile?.isAdmin
    ? [
        { label: 'Contentcontrole', icon: <IconEye size={18} />,        path: '/admin/content-review' },
        { label: T.nav.sections,    icon: <IconLayoutList size={18} />, path: '/content/sections' },
        { label: T.nav.exercises,   icon: <IconBolt size={18} />,       path: '/content/exercises' },
      ]
    : []

  return (
    <nav className={classes.rail} aria-label={T.rail.mainNav}>
      <span className={classes.wordmark}>
        <span className={classes.wordmarkMark}>
          <SunMark size={28} />
        </span>
        <span className={classes.wordmarkName}>Kamoe Bisa</span>
      </span>

      <button className={classes.cta} onClick={() => navigate('/session')}>
        <IconPlayerPlayFilled size={15} />
        {T.dashboard.startTodaysSessionMinimal}
      </button>

      <div className={classes.sectionLabel}>{T.rail.menu}</div>
      <div className={classes.nav}>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `${classes.navItem} ${isActive ? classes.navActive : ''}`}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
        {adminItems.length > 0 && (
          <>
            <div className={classes.navDivider} />
            {adminItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `${classes.navItem} ${isActive ? classes.navActive : ''}`}
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </div>

      <div className={classes.spacer} />

      <div className={classes.glance}>
        {glance && (
          <Link to="/" className={classes.glanceLink}>
            <span className={classes.glanceStreak}>
              <IconFlame
                size={15}
                className={glance.streakDays > 0 ? classes.flameLit : classes.flameOut}
              />
              <span className={classes.glanceCount}>{glance.streakDays}</span> {T.rail.days}
            </span>
            <span className={classes.glanceGoal}>
              {glance.minutesToday > 0 ? T.rail.goalDone : T.rail.goalOpen}
            </span>
          </Link>
        )}
        <button
          className={classes.themeToggle}
          onClick={toggleColorScheme}
          title={T.common.toggleTheme}
          aria-label={T.common.toggleTheme}
        >
          {colorScheme === 'dark' ? <IconSun size={14} /> : <IconMoon size={14} />}
        </button>
      </div>
    </nav>
  )
}
