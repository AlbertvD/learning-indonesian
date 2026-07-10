// src/components/progress/TrendChart.tsx
//
// A small dependency-free multi-line SVG chart for the mastery-detail growth
// sections (the codebase hand-rolls its viz — MasteryLadder, TimeComparison —
// rather than pulling in a chart library). Renders one polyline per visible
// series over a shared x-axis of week labels, with `null` values breaking the
// line into segments (weeks before a learner's first data). Responsive via
// viewBox; colours + visibility are the caller's concern (the cards own the
// legend/selector).
//
// A series flagged `area: true` (GrowthCurveCard's single climbing "usable"
// line, voortgang-hub-redesign) also fills the region under its line with a
// fading gradient, per contiguous non-null run — same null-break rule as the
// stroke path.
import { useId } from 'react'
import classes from './TrendChart.module.css'

export interface TrendSeries {
  key: string
  label: string
  color: string
  /** One value per x-tick; `null` = no data that week (gap in the line). */
  values: (number | null)[]
  hidden?: boolean
  /** Fill the area under this series with a fading gradient of its color. */
  area?: boolean
}

export interface TrendChartProps {
  /** x-axis tick labels, oldest→newest (only first + last are drawn, to stay legible). */
  xLabels: string[]
  series: TrendSeries[]
  /** Optional formatter for the single max-value label drawn top-left. */
  formatMax?: (value: number) => string
  /** Draw the single top-left max/ceiling label. On (default) for single-series
   *  charts where it reads as the line's peak; off for multi-line charts where a
   *  lone number can't tell the selected lines apart (they carry their own values). */
  showMaxLabel?: boolean
  height?: number
}

const W = 300
const PAD_X = 4
const PAD_Y = 8

export function TrendChart({ xLabels, series, formatMax, showMaxLabel = true, height = 120 }: TrendChartProps) {
  const clipId = useId()
  const gradId = useId()
  const visible = series.filter((s) => !s.hidden)
  const n = xLabels.length
  const allValues = visible.flatMap((s) => s.values.filter((v): v is number => v != null))
  const max = Math.max(1, ...allValues)
  const H = height

  // x for tick i, y for a value (0..max mapped to the padded plot area, inverted).
  const xAt = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X))
  const yAt = (v: number) => PAD_Y + (1 - v / max) * (H - 2 * PAD_Y)
  const baseline = H - PAD_Y

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

  // One closed fill polygon per contiguous non-null run, dropping to the
  // baseline at each run's start/end — mirrors pathFor's null-break rule.
  const areaSegmentsFor = (values: (number | null)[]): string[] => {
    const segments: string[] = []
    let run: { i: number; v: number }[] = []
    const flush = () => {
      if (run.length === 0) return
      const first = run[0]
      const last = run[run.length - 1]
      const top = run.map((p) => `L${xAt(p.i).toFixed(1)} ${yAt(p.v).toFixed(1)}`).join(' ')
      segments.push(`M${xAt(first.i).toFixed(1)} ${baseline.toFixed(1)} ${top} L${xAt(last.i).toFixed(1)} ${baseline.toFixed(1)} Z`)
      run = []
    }
    values.forEach((v, i) => {
      if (v == null) {
        flush()
        return
      }
      run.push({ i, v })
    })
    flush()
    return segments
  }

  const areaSeries = visible.filter((s) => s.area)

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
        {areaSeries.map((s) => (
          <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      {/* baseline */}
      <line x1={PAD_X} y1={baseline} x2={W - PAD_X} y2={baseline} className={classes.axis} />
      <g clipPath={`url(#${clipId})`}>
        {areaSeries.flatMap((s) =>
          areaSegmentsFor(s.values).map((d, i) => (
            <path key={`${s.key}-area-${i}`} d={d} fill={`url(#${gradId}-${s.key})`} stroke="none" />
          )),
        )}
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
      {showMaxLabel && allValues.length > 0 && (
        <text x={PAD_X} y={PAD_Y + 2} className={classes.maxLabel}>
          {formatMax ? formatMax(max) : String(max)}
        </text>
      )}
    </svg>
  )
}
