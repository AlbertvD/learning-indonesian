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
// A series flagged `area: true` also fills the region under its line with a
// fading gradient, per contiguous non-null run — same null-break rule as the
// stroke path. This is the single-series mode DurabilityCard uses.
//
// `stacked` mode (GrowthCurveCard's 4-rung ladder-over-time, voortgang-polish)
// renders `series` bottom-to-top as a cumulative stacked area instead: each
// band k fills between the running cumulative sum of series[0..k-1] and
// series[0..k] — a closed polygon walking the cumulative-top boundary forward
// then the previous-cumulative boundary back. A week is null for a band the
// moment ANY contributing series is null there (propagates upward through the
// stack), matching the same null-break rule as the line/area paths. Stacked
// mode also draws one right-edge count label per band, at the band's latest
// vertical midpoint, nudged apart if bands are thin — these replace an x-axis
// legend; the top-left max label is skipped (a single ceiling number can't
// speak for 4 bands). Rung names are the caller's concern (GrowthCurveCard
// renders its own compact legend row below the chart).
//
// `belowSeries` (stacked mode only, voortgang-polish at-risk band) draws one
// extra series BELOW the x-axis on the same px-per-unit scale as the forward
// stack, so a word leaving the stack (lapsing) visibly moves from the "up"
// half to the "down" half instead of just vanishing — forward-rungs-up +
// at-risk-down accounts for every word. The axis line itself moves up to
// `axisY` to leave room for the down half; everything about the forward
// stack (band polygons, top strokes, right-edge labels) keeps using `yAt`'s
// replacement `yUp`, which is `yAt` verbatim whenever `belowSeries` is absent
// — so the no-below and single-series (DurabilityCard) paths are provably
// unchanged.
import { useId } from 'react'
import classes from './TrendChart.module.css'

export interface TrendSeries {
  key: string
  label: string
  color: string
  /** One value per x-tick; `null` = no data that week (gap in the line). */
  values: (number | null)[]
  hidden?: boolean
  /** Fill the area under this series with a fading gradient of its color.
   *  Ignored in `stacked` mode (bands always fill). */
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
   *  lone number can't tell the selected lines apart (they carry their own values).
   *  Always off when `stacked` is true. */
  showMaxLabel?: boolean
  height?: number
  /** Render `series` as a bottom-to-top cumulative stacked area (series[0] =
   *  bottom band) instead of independent lines. Draws right-edge count labels
   *  per band instead of the top-left max label. */
  stacked?: boolean
  /** A single series drawn BELOW the x-axis, on a shared px-per-unit scale
   *  with the forward `stacked` total — only meaningful when `stacked` is
   *  true. Ignored otherwise. */
  belowSeries?: TrendSeries
}

const W = 300
const PAD_X = 4
const PAD_Y = 8
/** Minimum vertical gap (svg y-units) between adjacent right-edge stack labels. */
const LABEL_MIN_GAP = 12

export function TrendChart({
  xLabels,
  series,
  formatMax,
  showMaxLabel = true,
  height = 120,
  stacked = false,
  belowSeries,
}: TrendChartProps) {
  const clipId = useId()
  const gradId = useId()
  const visible = series.filter((s) => !s.hidden)
  const n = xLabels.length
  const allValues = visible.flatMap((s) => s.values.filter((v): v is number => v != null))

  // Bottom-up running cumulative sums, one array per band; a week is null for
  // band k the moment any of series[0..k]'s value is null there.
  const stackedCum: (number | null)[][] = []
  if (stacked) {
    let running: (number | null)[] = new Array(n).fill(0)
    for (const s of visible) {
      running = running.map((prevCum, i) => {
        const v = s.values[i]
        return prevCum == null || v == null ? null : prevCum + v
      })
      stackedCum.push(running)
    }
  }

  const max = stacked
    ? Math.max(1, ...(stackedCum[stackedCum.length - 1] ?? []).filter((v): v is number => v != null))
    : Math.max(1, ...allValues)
  const H = height

  // x for tick i, y for a value (0..max mapped to the padded plot area, inverted).
  const xAt = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X))
  const yAt = (v: number) => PAD_Y + (1 - v / max) * (H - 2 * PAD_Y)
  const baseline = H - PAD_Y

  // Below-axis band (stacked mode only): one shared px-per-unit `scale`
  // between the forward stack (0..maxUp, drawn up from `axisY`) and
  // `belowSeries` (0..maxDown, drawn down from `axisY`) — so a unit up and a
  // unit down read as the same visual size. `axisY` moves up from the plot
  // bottom to leave room for the down half. When `belowSeries` is absent,
  // `axisY === baseline` and `yUp === yAt` exactly, so every consumer below
  // that reads `yUp`/`axisY` instead of `yAt`/`baseline` is byte-for-byte
  // unchanged in the no-below case.
  const hasBelow = stacked && belowSeries != null
  const maxUp = max
  const maxDown = hasBelow
    ? Math.max(1, ...belowSeries!.values.filter((v): v is number => v != null))
    : 0
  const scale = hasBelow ? (H - 2 * PAD_Y) / (maxUp + maxDown) : 0
  const axisY = hasBelow ? PAD_Y + maxUp * scale : baseline
  const yUp = hasBelow ? (v: number) => axisY - v * scale : yAt
  const yDown = (v: number) => axisY + v * scale

  // Build one or more path segments per series, breaking on nulls.
  // `yFn` defaults to `yUp` (the forward-stack / non-stacked line direction);
  // the below-axis band passes `yDown` explicitly.
  const pathFor = (values: (number | null)[], yFn: (v: number) => number = yUp): string => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yFn(v).toFixed(1)} `
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

  // One closed fill polygon per contiguous non-null run of a stacked band —
  // walks the cumulative-top boundary forward, then the previous-cumulative
  // (lower) boundary back, closing the polygon. `lower[i]` is only read where
  // `upper[i]` is non-null (guaranteed non-null there — see stackedCum above).
  // Uses `yUp` (== `yAt` when `belowSeries` is absent) — forward-stack geometry.
  const stackedBandSegmentsFor = (lower: (number | null)[], upper: (number | null)[]): string[] => {
    const segments: string[] = []
    let run: { i: number; lo: number; hi: number }[] = []
    const flush = () => {
      if (run.length === 0) return
      const top = run.map((p) => `L${xAt(p.i).toFixed(1)} ${yUp(p.hi).toFixed(1)}`).join(' ')
      const bottom = [...run].reverse().map((p) => `L${xAt(p.i).toFixed(1)} ${yUp(p.lo).toFixed(1)}`).join(' ')
      const first = run[0]
      segments.push(`M${xAt(first.i).toFixed(1)} ${yUp(first.lo).toFixed(1)} ${top} ${bottom} Z`)
      run = []
    }
    upper.forEach((hi, i) => {
      if (hi == null) {
        flush()
        return
      }
      run.push({ i, lo: lower[i] ?? 0, hi })
    })
    flush()
    return segments
  }

  // One closed fill polygon per contiguous non-null run of the below-axis
  // band — mirrors `stackedBandSegmentsFor`'s null-break rule, walking the
  // 0-line (`axisY`) forward then the `yDown(value)` boundary back. Only
  // meaningful when `hasBelow`.
  const belowBandSegmentsFor = (values: (number | null)[]): string[] => {
    const segments: string[] = []
    let run: { i: number; v: number }[] = []
    const flush = () => {
      if (run.length === 0) return
      const first = run[0]
      const last = run[run.length - 1]
      const edge = run.map((p) => `L${xAt(p.i).toFixed(1)} ${yDown(p.v).toFixed(1)}`).join(' ')
      segments.push(
        `M${xAt(first.i).toFixed(1)} ${axisY.toFixed(1)} ${edge} L${xAt(last.i).toFixed(1)} ${axisY.toFixed(1)} Z`,
      )
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

  const areaSeries = stacked ? [] : visible.filter((s) => s.area)

  // Right-edge stack labels: one per band, at the latest week where every
  // band has data, positioned at that band's cumulative vertical midpoint
  // then nudged apart (top → bottom) so thin bands don't overlap. Uses `yUp`
  // (== `yAt` when `belowSeries` is absent) and floors overflow at `axisY`
  // (== `baseline` when absent) — forward-stack geometry.
  let stackLabels: { key: string; color: string; value: number; y: number }[] = []
  // The at-risk band's single right-edge count label, at the same latest
  // week as the forward-stack labels.
  let belowLabel: { color: string; value: number; y: number } | null = null
  if (stacked) {
    let lastIdx = -1
    for (let i = n - 1; i >= 0; i--) {
      if (visible.every((s) => s.values[i] != null)) {
        lastIdx = i
        break
      }
    }
    if (lastIdx >= 0) {
      stackLabels = visible
        .map((s, k) => {
          const lo = k === 0 ? 0 : (stackedCum[k - 1][lastIdx] ?? 0)
          const hi = stackedCum[k][lastIdx] ?? lo
          return { key: s.key, color: s.color, value: s.values[lastIdx] ?? 0, y: yUp((lo + hi) / 2) }
        })
        .sort((a, b) => a.y - b.y)
      for (let i = 1; i < stackLabels.length; i++) {
        if (stackLabels[i].y - stackLabels[i - 1].y < LABEL_MIN_GAP) {
          stackLabels[i].y = stackLabels[i - 1].y + LABEL_MIN_GAP
        }
      }
      const overflow = stackLabels.length ? stackLabels[stackLabels.length - 1].y - axisY : 0
      if (overflow > 0) {
        stackLabels = stackLabels.map((l) => ({ ...l, y: l.y - overflow }))
      }

      if (hasBelow) {
        const belowValue = belowSeries!.values[lastIdx]
        if (belowValue != null) {
          belowLabel = { color: belowSeries!.color, value: belowValue, y: yDown(belowValue / 2) }
        }
      }
    }
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
        {areaSeries.map((s) => (
          <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
          </linearGradient>
        ))}
      </defs>
      {/* baseline — axisY (== plot bottom when there's no below-axis band) */}
      <line x1={PAD_X} y1={axisY} x2={W - PAD_X} y2={axisY} className={classes.axis} />
      <g clipPath={`url(#${clipId})`}>
        {stacked ? (
          <>
            {visible.flatMap((s, k) => {
              const lower = k === 0 ? new Array(n).fill(0) : stackedCum[k - 1]
              return stackedBandSegmentsFor(lower, stackedCum[k]).map((d, i) => (
                <path key={`${s.key}-band-${i}`} d={d} fill={s.color} fillOpacity={0.55} stroke="none" />
              ))
            })}
            {/* No per-band top stroke: a zero-height band (e.g. mastered=0)
                would draw a misleading colored line at the stack top (a green
                "Zit erin" line where nothing is mastered). The fills + colors
                carry the composition; the right-edge counts carry the values. */}
            {hasBelow &&
              belowBandSegmentsFor(belowSeries!.values).map((d, i) => (
                <path
                  key={`${belowSeries!.key}-band-${i}`}
                  d={d}
                  fill={belowSeries!.color}
                  fillOpacity={0.55}
                  stroke="none"
                />
              ))}
          </>
        ) : (
          <>
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
          </>
        )}
      </g>
      {stacked ? (
        <>
          {stackLabels.map((l) => (
            <text key={l.key} x={W - PAD_X} y={l.y} textAnchor="end" fill={l.color} className={classes.stackLabel}>
              {l.value}
            </text>
          ))}
          {belowLabel && (
            <text
              key={belowSeries!.key}
              x={W - PAD_X}
              y={belowLabel.y}
              textAnchor="end"
              fill={belowLabel.color}
              className={classes.stackLabel}
            >
              {belowLabel.value}
            </text>
          )}
        </>
      ) : (
        showMaxLabel &&
        allValues.length > 0 && (
          <text x={PAD_X} y={PAD_Y + 2} className={classes.maxLabel}>
            {formatMax ? formatMax(max) : String(max)}
          </text>
        )
      )}
    </svg>
  )
}
