// src/components/progress/MasteryFunnel.tsx
import { Anchor } from '@mantine/core'
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

const PIPELINE_STAGES = [
  { key: 'anchoring' as const,   label: 'Inprenten' },
  { key: 'retrieving' as const,  label: 'Oproepen' },
  { key: 'productive' as const,  label: 'Productief' },
  { key: 'maintenance' as const, label: 'Onderhoud' },
]

export function MasteryFunnel({ itemsByStage }: MasteryFunnelProps) {
  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)

  // Bottleneck: the non-new stage with the most items (only if meaningful count)
  const bottleneckKey = PIPELINE_STAGES.reduce<typeof PIPELINE_STAGES[number] | null>((best, stage) => {
    if (itemsByStage[stage.key] === 0) return best
    if (!best) return stage
    return itemsByStage[stage.key] > itemsByStage[best.key] ? stage : best
  }, null)?.key ?? null

  const anchoringCount = itemsByStage.anchoring
  const showWarning = totalItems > 0 && anchoringCount / totalItems > 0.5

  if (totalItems === 0) {
    return (
      <div>
        <div className="section-label">Leerpijplijn</div>
        <p className={classes.empty}>Nog geen woorden geleerd.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="section-label">Leerpijplijn</div>

      <div className={classes.card}>
        <div className={classes.pipelineRow}>
          {PIPELINE_STAGES.map((stage, i) => {
            const count = itemsByStage[stage.key]
            const isBottleneck = stage.key === bottleneckKey
            const isLast = i === PIPELINE_STAGES.length - 1
            const isFirst = i === 0

            return (
              <div
                key={stage.key}
                className={[
                  classes.stage,
                  isBottleneck ? classes.stageBottleneck : '',
                  isFirst ? classes.stageFirst : '',
                  isLast ? classes.stageLast : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={classes.stageName}>
                  {isBottleneck && <span className={classes.warningIcon}>⚠</span>}
                  {stage.label}
                </div>
                <div className={[classes.stageCount, isBottleneck ? classes.stageCountBottleneck : count === 0 ? classes.stageCountZero : ''].filter(Boolean).join(' ')}>
                  {count}
                </div>
                <div className={classes.stageUnit}>items</div>
              </div>
            )
          })}
        </div>

        <div className={classes.footer}>
          {showWarning && (
            <div className={classes.warningBanner}>
              <span>⚠️</span>
              <span>{anchoringCount} items wachten op hun eerste poortcheck om naar Oproepen te gaan.</span>
            </div>
          )}
          <Anchor
            component={Link}
            to="/session?mode=gate_check"
            className={classes.milestonePill}
            underline="never"
          >
            → Volgende mijlpaal: item naar Oproepen
          </Anchor>
        </div>
      </div>
    </div>
  )
}
