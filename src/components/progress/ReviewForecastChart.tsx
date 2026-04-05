// src/components/progress/ReviewForecastChart.tsx
import classes from './ReviewForecastChart.module.css'

interface ReviewForecastChartProps {
  forecast: { date: Date; count: number }[]
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export function ReviewForecastChart({ forecast }: ReviewForecastChartProps) {
  const allEmpty = forecast.every((d) => d.count === 0)

  if (allEmpty) {
    return (
      <div className={classes.card}>
        <div className={classes.cardTitle}>7-Daagse Voorspelling</div>
        <p className={classes.empty}>Geen reviews gepland de komende 7 dagen</p>
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
      <div className={classes.cardTitle}>7-Daagse Voorspelling</div>

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
                ? 'Vand.'
                : capitalize(day.date.toLocaleDateString('nl-NL', { weekday: 'short' }))

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
                      <strong>Als je deze dag overslaat:</strong><br />
                      {day.count} items schuiven door — backlog stijgt naar{' '}
                      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{day.count + 15} items</span>.
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
          {capitalize(forecast[spikeDay].date.toLocaleDateString('nl-NL', { weekday: 'long' }))}: {forecast[spikeDay].count} kaarten vervallen — plan extra tijd in.
        </p>
      )}

      {/* Projected next week */}
      <div className={classes.projSection}>
        <div className={classes.projLabel}>Volgende week (als je consistent blijft)</div>
        <div className={classes.projBars}>
          {forecast.map((day, i) => {
            const projCount = projectedValues[i]
            const heightPct = projCount > 0 ? (projCount / maxProjected) * 100 : 0
            const dayLabel = i === 0
              ? 'Vand.'
              : capitalize(day.date.toLocaleDateString('nl-NL', { weekday: 'short' }))

            return (
              <div key={i} className={classes.projBarCol}>
                <div className={classes.projBar} style={{ height: `${heightPct}%` }} />
                <span className={classes.projDayLabel}>{dayLabel}</span>
              </div>
            )
          })}
        </div>
        <div className={classes.projSuccess}>
          ✓ Max {Math.max(...projectedValues)} kaarten/dag — geen spikes
        </div>
      </div>
    </div>
  )
}
