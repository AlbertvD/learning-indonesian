// src/components/progress/ReviewForecastChart.tsx
import { Paper, Box, Text, Badge, Divider, Tooltip } from '@mantine/core'
import classes from './ReviewForecastChart.module.css'

interface ReviewForecastChartProps {
  forecast: { date: Date; count: number }[]
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getBarColor(count: number, isToday: boolean): string {
  if (count > 40) return 'var(--mantine-color-red-6)'
  if (count > 20) return 'var(--mantine-color-orange-5)'
  if (isToday) return 'var(--mantine-color-cyan-6)'
  return 'var(--mantine-color-cyan-3)'
}

export function ReviewForecastChart({ forecast }: ReviewForecastChartProps) {
  const allEmpty = forecast.every((d) => d.count === 0)

  if (allEmpty) {
    return (
      <Box>
        <Text
          size="sm"
          c="dimmed"
          tt="uppercase"
          mb="sm"
          style={{ letterSpacing: '0.1em', fontWeight: 500 }}
        >
          Reviewprognose (7 dagen)
        </Text>
        <Paper withBorder p="md">
          <Text c="dimmed" ta="center" py="xl">
            Geen reviews gepland de komende 7 dagen
          </Text>
        </Paper>
      </Box>
    )
  }

  const maxCount = Math.max(...forecast.map((d) => d.count), 1)

  const projectedValues = forecast.map((d) => Math.round(d.count * 0.5))
  const maxProjected = Math.max(...projectedValues, 1)

  return (
    <Box>
      <Text
        size="sm"
        c="dimmed"
        tt="uppercase"
        mb="sm"
        style={{ letterSpacing: '0.1em', fontWeight: 500 }}
      >
        Reviewprognose (7 dagen)
      </Text>

      <Paper withBorder p="md">
        {/* Main bar chart */}
        <Box className={classes.chartRow}>
          {forecast.map((day, i) => {
            const isToday = i === 0
            const barHeightPx =
              day.count > 0 ? Math.max(4, Math.round((day.count / maxCount) * 90)) : 0
            const barColor = getBarColor(day.count, isToday)
            const isSpike = day.count > 40

            const dayLabel = isToday
              ? 'Vand.'
              : capitalize(
                  day.date.toLocaleDateString('nl-NL', { weekday: 'short' })
                )

            const column = (
              <Box
                key={i}
                className={classes.barColumn}
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                {/* Spike badge */}
                {isSpike && (
                  <Badge size="xs" color="red" mb={2}>
                    !
                  </Badge>
                )}

                {/* Count label */}
                <Text
                  className={classes.countLabel}
                  style={{
                    opacity: day.count === 0 ? 0.4 : 1,
                  }}
                >
                  {day.count}
                </Text>

                {/* Bar */}
                <Box
                  className={classes.bar}
                  style={{
                    height: barHeightPx,
                    backgroundColor: barColor,
                    opacity: !isToday && day.count <= 20 && day.count > 0 ? 0.6 : 1,
                    animationDelay: `${0.05 * i}s`,
                  }}
                />

                {/* Day label */}
                <Text
                  className={classes.dayLabel}
                  style={{
                    fontWeight: isToday ? 700 : 400,
                    textDecoration: isToday ? 'underline' : 'none',
                  }}
                >
                  {dayLabel}
                </Text>
              </Box>
            )

            if (isSpike) {
              return (
                <Tooltip
                  key={i}
                  label={`Overslaan kost je ${day.count} extra items morgen — backlog loopt op naar ${day.count + 15}`}
                  withArrow
                >
                  {column}
                </Tooltip>
              )
            }

            return column
          })}
        </Box>

        {/* Legend */}
        <Box className={classes.legend}>
          <Text className={classes.legendItem} style={{ color: 'var(--mantine-color-cyan-6)' }}>
            ■ Vandaag
          </Text>
          <Text className={classes.legendItem} style={{ color: 'var(--mantine-color-red-6)' }}>
            ■ Piek (&gt;40)
          </Text>
          <Text className={classes.legendItem} style={{ color: 'var(--mantine-color-cyan-3)' }}>
            ■ Normaal
          </Text>
        </Box>

        <Divider my="md" />

        {/* Projected mini chart */}
        <Text className={classes.projectedTitle} c="dimmed">
          Volgende week (als je consistent blijft)
        </Text>

        <Box className={classes.miniChartRow}>
          {forecast.map((day, i) => {
            const projCount = projectedValues[i]
            const barHeightPx =
              projCount > 0 ? Math.max(2, Math.round((projCount / maxProjected) * 32)) : 0

            const dayLabel =
              i === 0
                ? 'Vand.'
                : capitalize(
                    day.date.toLocaleDateString('nl-NL', { weekday: 'short' })
                  )

            return (
              <Box key={i} className={classes.miniBarColumn}>
                <Box
                  className={classes.miniBar}
                  style={{
                    height: barHeightPx,
                    animationDelay: `${0.05 * i + 0.4}s`,
                  }}
                />
                <Text className={classes.miniDayLabel}>{dayLabel}</Text>
              </Box>
            )
          })}
        </Box>

        <Text className={classes.successText}>
          ✓ Max {Math.max(...projectedValues)}/dag — geen spikes
        </Text>
      </Paper>
    </Box>
  )
}
