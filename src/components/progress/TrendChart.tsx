// src/components/progress/TrendChart.tsx
//
// A small dependency-free multi-line SVG chart for the Groei tab (the codebase
// hand-rolls its viz — MasteryJourney, TimeComparison — rather than pulling in a
// chart library). Renders one polyline per visible series over a shared x-axis of
// week labels, with `null` values breaking the line into segments (weeks before a
// learner's first data). Responsive via viewBox; colours + visibility are the
// caller's concern (the cards own the legend/selector).
import { useId } from 'react'
import classes from './TrendChart.module.css'

export interface TrendSeries {
  key: string
  label: string
  color: string
  /** One value per x-tick; `null` = no data that week (gap in the line). */
  values: (number | null)[]
  hidden?: boolean
}

export interface TrendChartProps {
  /** x-axis tick labels, oldest→newest (only first + last are drawn, to stay legible). */
  xLabels: string[]
  series: TrendSeries[]
  /** Optional formatter for the single max-value label drawn top-left. */
  formatMax?: (value: number) => string
  height?: number
}

const W = 300
const PAD_X = 4
const PAD_Y = 8

export function TrendChart({ xLabels, series, formatMax, height = 120 }: TrendChartProps) {
  const clipId = useId()
  const visible = series.filter((s) => !s.hidden)
  const n = xLabels.length
  const allValues = visible.flatMap((s) => s.values.filter((v): v is number => v != null))
  const max = Math.max(1, ...allValues)
  const H = height

  // x for tick i, y for a value (0..max mapped to the padded plot area, inverted).
  const xAt = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X))
  const yAt = (v: number) => PAD_Y + (1 - v / max) * (H - 2 * PAD_Y)

  // Build one or more path segments per series, breaking on nulls.
  const pathFor = (values: (number | null)[]): string => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)} `
      pen = true
    })
    return d.trim()
  }

  return (
    <svg
      className={classes.chart}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend"
      style={{ height }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
      </defs>
      {/* baseline */}
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} className={classes.axis} />
      <g clipPath={`url(#${clipId})`}>
        {visible.map((s) => {
          const d = pathFor(s.values)
          if (!d) return null
          return <path key={s.key} d={d} fill="none" stroke={s.color} className={classes.line} />
        })}
        {/* dot on the last real value of each visible series */}
        {visible.map((s) => {
          for (let i = s.values.length - 1; i >= 0; i--) {
            const v = s.values[i]
            if (v != null) return <circle key={s.key} cx={xAt(i)} cy={yAt(v)} r={2.6} fill={s.color} />
          }
          return null
        })}
      </g>
      {allValues.length > 0 && (
        <text x={PAD_X} y={PAD_Y + 2} className={classes.maxLabel}>
          {formatMax ? formatMax(max) : String(max)}
        </text>
      )}
    </svg>
  )
}
