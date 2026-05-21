// src/components/progress/ReviewForecastChart.tsx
import { useT } from '@/hooks/useT'
import { useAuthStore } from '@/stores/authStore'
import classes from './ReviewForecastChart.module.css'

interface ReviewForecastChartProps {
  forecast: { date: Date; count: number }[]
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function fillTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

export function ReviewForecastChart({ forecast }: ReviewForecastChartProps) {
  const T = useT()
  const language = useAuthStore((state) => state.profile?.language ?? 'nl')
  const dateLocale = language === 'en' ? 'en-US' : 'nl-NL'
  const allEmpty = forecast.every((d) => d.count === 0)

  if (allEmpty) {
    return (
      <div className={classes.card}>
        <div className={classes.cardTitle}>{T.progress.forecastTitle}</div>
        <p className={classes.empty}>{T.progress.forecastEmpty}</p>
      </div>
    )
  }

  const maxCount = Math.max(...forecast.map((d) => d.count), 1)
  const chartMax = Math.ceil(maxCount / 10) * 10 + 10

  const projectedValues = forecast.map((d) => Math.round(d.count * 0.5))
  const maxProjected = Math.max(...projectedValues, 1)

  const yLabels: number[] = []
  const steps = 5
  for (let i = steps; i >= 0; i--) {
    yLabels.push(Math.round((chartMax / steps) * i))
  }

  const spikeDay = forecast.reduce<number | null>((best, d, i) => {
    if (d.count > 40 && (best === null || d.count > forecast[best].count)) return i
    return best
  }, null)

  return (
    <div className={classes.card}>
      <div className={classes.cardTitle}>{T.progress.forecastTitle}</div>

      {/* Bar chart with y-axis */}
      <div className={classes.chartArea}>
        {/* Y-axis */}
        <div className={classes.yAxis}>
          {yLabels.map((v) => (
            <span key={v} className={classes.yLabel}>{v}</span>
          ))}
        </div>

        {/* Grid + bars */}
        <div className={classes.chartBody}>
          {/* Gridlines */}
          <div className={classes.gridlines}>
            {yLabels.map((v) => (
              <div key={v} className={classes.gridline} />
            ))}
          </div>

          {/* Bars */}
          <div className={classes.barsRow}>
            {forecast.map((day, i) => {
              const isToday = i === 0
              const isSpike = day.count > 40
              const barHeightPct = day.count > 0 ? (day.count / chartMax) * 100 : 0

              const dayLabel = isToday
                ? T.progress.todayShort
                : capitalize(day.date.toLocaleDateString(dateLocale, { weekday: 'short' }))

              return (
                <div key={i} className={`${classes.barCol} ${isSpike ? classes.barColSpike : ''}`}>
                  {isSpike && (
                    <div className={classes.spikeBadge}>!</div>
                  )}
                  <div
                    className={`${classes.bar} ${isSpike ? classes.barDanger : classes.barAccent}`}
                    style={{
                      height: `${barHeightPct}%`,
                      animationDelay: `${0.05 * i}s`,
                    }}
                  />
                  <div className={`${classes.dayLabel} ${isToday ? classes.dayLabelToday : ''} ${isSpike ? classes.dayLabelDanger : ''}`}>
                    {dayLabel}
                  </div>
                  {isSpike && (
                    <div className={classes.whatifTooltip}>
                      <strong>{T.progress.skipIntro}</strong><br />
                      {fillTemplate(T.progress.skipBacklog, { count: day.count, newCount: day.count + 15 })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {spikeDay !== null && (
        <p className={classes.spikeNote}>
          <span style={{ color: 'var(--danger)' }}>■</span>{' '}
          {fillTemplate(T.progress.spikeNote, {
            day: capitalize(forecast[spikeDay].date.toLocaleDateString(dateLocale, { weekday: 'long' })),
            count: forecast[spikeDay].count,
          })}
        </p>
      )}

      {/* Projected next week */}
      <div className={classes.projSection}>
        <div className={classes.projLabel}>{T.progress.projectedNextWeek}</div>
        <div className={classes.projBars}>
          {forecast.map((day, i) => {
            const projCount = projectedValues[i]
            const heightPct = projCount > 0 ? (projCount / maxProjected) * 100 : 0
            const dayLabel = i === 0
              ? T.progress.todayShort
              : capitalize(day.date.toLocaleDateString(dateLocale, { weekday: 'short' }))

            return (
              <div key={i} className={classes.projBarCol}>
                <div className={classes.projBar} style={{ height: `${heightPct}%` }} />
                <span className={classes.projDayLabel}>{dayLabel}</span>
              </div>
            )
          })}
        </div>
        <div className={classes.projSuccess}>
          {fillTemplate(T.progress.projectedSuccess, { n: Math.max(...projectedValues) })}
        </div>
      </div>
    </div>
  )
}
