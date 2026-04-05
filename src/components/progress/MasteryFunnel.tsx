// src/components/progress/MasteryFunnel.tsx
import { Anchor, Badge, Box, Text, Tooltip } from '@mantine/core'
import { Link } from 'react-router-dom'
import classes from './MasteryFunnel.module.css'

interface MasteryFunnelProps {
  itemsByStage: {
    new: number
    anchoring: number
    retrieving: number
    productive: number
    maintenance: number
  }
}

const STAGE_ORDER = ['maintenance', 'productive', 'retrieving', 'anchoring', 'new'] as const
type Stage = (typeof STAGE_ORDER)[number]

const DUTCH_LABELS: Record<Stage, string> = {
  maintenance: 'Onderhoud',
  productive: 'Productief',
  retrieving: 'Ophalen',
  anchoring: 'Verankeren',
  new: 'Nieuw',
}

const BAR_COLORS: Record<Stage, string> = {
  maintenance: 'var(--success)',       // #32D74B green
  productive:  '#30D5C8',              // teal
  retrieving:  'var(--accent-primary)', // cyan
  anchoring:   'var(--warning)',        // #FF9500 orange
  new:         'var(--text-secondary)', // dimmed gray
}

export function MasteryFunnel({ itemsByStage }: MasteryFunnelProps) {
  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)

  // Bottleneck: highest count among non-new stages (only if > 0)
  const nonNewStages: Stage[] = ['anchoring', 'retrieving', 'productive', 'maintenance']
  const bottleneckStage = nonNewStages.reduce<Stage | null>((best, stage) => {
    if (itemsByStage[stage] === 0) return best
    if (best === null) return stage
    return itemsByStage[stage] > itemsByStage[best] ? stage : best
  }, null)

  const anchoringCount = itemsByStage.anchoring
  const showWarningBanner = totalItems > 0 && anchoringCount / totalItems > 0.5

  return (
    <Box className={classes.root}>
      <Text className={classes.sectionTitle}>Leerpijplijn</Text>

      {totalItems === 0 ? (
        <Text c="dimmed" size="sm" mt="xs">
          Nog geen woorden geleerd.
        </Text>
      ) : (
        <>
          <Text className={classes.summary}>
            {totalItems} woorden in het systeem
          </Text>

          <Box className={classes.funnel}>
            {STAGE_ORDER.map((stage) => {
              const count = itemsByStage[stage]
              const isBottleneck = stage === bottleneckStage
              const barWidth = totalItems > 0 ? `${(count / totalItems) * 100}%` : '0%'
              const label = isBottleneck ? `⚠ ${DUTCH_LABELS[stage]}` : DUTCH_LABELS[stage]

              return (
                <Box
                  key={stage}
                  className={`${classes.row} ${isBottleneck ? classes.rowBottleneck : ''}`}
                >
                  <Text className={classes.stageLabel} title={DUTCH_LABELS[stage]}>
                    {label}
                  </Text>

                  <Badge
                    size="sm"
                    variant="light"
                    className={classes.countBadge}
                  >
                    {count}
                  </Badge>

                  <Box className={classes.barTrack}>
                    <Box
                      className={classes.bar}
                      style={{
                        width: barWidth,
                        backgroundColor: BAR_COLORS[stage],
                      }}
                    />

                    {/* Milestone star on maintenance row when count is 0 */}
                    {stage === 'maintenance' && count === 0 && (
                      <Tooltip
                        label="Doel: Eerste 10 stabiele items. Items in Productive & Maintenance verhogen je rang."
                        multiline
                        w={260}
                        withArrow
                      >
                        <Text component="span" className={classes.milestoneStar}>
                          ★
                        </Text>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>

          {/* Warning banner */}
          {showWarningBanner && (
            <Text className={classes.warningBanner}>
              ⚠ {anchoringCount} items wachten op hun eerste 'Poortcheck' om naar de Retrieving-fase te gaan.
            </Text>
          )}

          {/* Next milestone pill */}
          <Anchor
            component={Link}
            to="/session?mode=gate_check"
            className={classes.milestonePill}
            underline="never"
          >
            → Volgende mijlpaal: {Math.max(anchoringCount, 1)} item(s) naar Retrieving
          </Anchor>
        </>
      )}
    </Box>
  )
}
