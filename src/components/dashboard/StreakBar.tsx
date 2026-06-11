// src/components/dashboard/StreakBar.tsx
//
// The home "streak" hero: a top bar that turns the daily streak into a real
// visual presence. Left = the flame + streak count; right = the last 5 days as
// session bars (bar height ∝ sessions that day, the running streak glowing in
// warm flame tones behind the consecutive active days). The whole bar links to
// the Tijd sub-page on voortgang.
import { Link } from 'react-router-dom'
import { IconFlame } from '@tabler/icons-react'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'
import type { DailyActivity } from '@/lib/analytics/engagement'
import classes from './StreakBar.module.css'

interface StreakBarProps {
  streakDays: number
  /** Chronological (oldest → newest, today last). */
  days: DailyActivity[]
  to?: string
}

export function StreakBar({ streakDays, days, to = '/progress?tab=time' }: StreakBarProps) {
  const T = useT()
  const lang = useAuthStore((s) => s.profile?.language ?? 'nl')
  const locale = lang === 'nl' ? 'nl-NL' : 'en-US'

  const maxSessions = Math.max(1, ...days.map((d) => d.sessions))
  // Streak membership within the visible window: consecutive active days counted
  // back from the newest. (The flame number is the true streak, which may exceed 5.)
  const inStreak: boolean[] = days.map(() => false)
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].sessions > 0) inStreak[i] = true
    else break
  }
  const todayKey = days.length ? days[days.length - 1].date : ''

  return (
    <Link to={to} className={classes.bar} aria-label={`${streakDays} ${T.dashboard.daysInARow}`}>
      <div className={classes.flame}>
        <IconFlame size={24} className={classes.flameIcon} />
        <div className={classes.streakNum}>{streakDays}</div>
        <div className={classes.streakLabel}>{T.dashboard.daysInARow}</div>
      </div>

      <div className={classes.days}>
        {days.map((d, i) => {
          const isToday = d.date === todayKey
          const heightPct = d.sessions === 0 ? 0 : 28 + 72 * (d.sessions / maxSessions)
          const weekday = new Date(d.date + 'T00:00:00')
            .toLocaleDateString(locale, { weekday: 'short' })
            .replace('.', '')
          return (
            <div key={d.date} className={classes.day}>
              <div className={classes.track}>
                <div
                  className={[
                    classes.fill,
                    inStreak[i] ? classes.fillStreak : '',
                    d.sessions === 0 ? classes.fillEmpty : '',
                  ].join(' ')}
                  style={{ height: `${heightPct}%` }}
                  aria-hidden
                />
                {d.sessions > 0 && <span className={classes.count}>{d.sessions}</span>}
              </div>
              <div className={`${classes.weekday} ${isToday ? classes.today : ''}`}>{weekday}</div>
            </div>
          )
        })}
      </div>
    </Link>
  )
}
