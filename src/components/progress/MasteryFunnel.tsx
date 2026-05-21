// src/components/progress/MasteryFunnel.tsx
import { useT } from '@/hooks/useT'
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

type StageKey = 'anchoring' | 'retrieving' | 'productive' | 'maintenance'
const STAGE_ORDER: StageKey[] = ['anchoring', 'retrieving', 'productive', 'maintenance']

export function MasteryFunnel({ itemsByStage }: MasteryFunnelProps) {
  const T = useT()
  const stageLabel: Record<StageKey, string> = {
    anchoring: T.progress.stageAnchoring,
    retrieving: T.progress.stageRetrieving,
    productive: T.progress.stageProductive,
    maintenance: T.progress.stageMaintenance,
  }

  const totalItems = Object.values(itemsByStage).reduce((a, b) => a + b, 0)

  // Bottleneck: the non-new stage with the most items (only if meaningful count)
  const bottleneckKey = STAGE_ORDER.reduce<StageKey | null>((best, stage) => {
    if (itemsByStage[stage] === 0) return best
    if (!best) return stage
    return itemsByStage[stage] > itemsByStage[best] ? stage : best
  }, null)

  if (totalItems === 0) {
    return (
      <div>
        <div className="section-label">{T.progress.funnelTitle}</div>
        <p className={classes.empty}>{T.progress.funnelEmpty}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="section-label">{T.progress.funnelTitle}</div>

      <div className={classes.card}>
        <div className={classes.pipelineRow}>
          {STAGE_ORDER.map((stage, i) => {
            const count = itemsByStage[stage]
            const isBottleneck = stage === bottleneckKey
            const isLast = i === STAGE_ORDER.length - 1
            const isFirst = i === 0

            return (
              <div
                key={stage}
                className={[
                  classes.stage,
                  isBottleneck ? classes.stageBottleneck : '',
                  isFirst ? classes.stageFirst : '',
                  isLast ? classes.stageLast : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={classes.stageName}>
                  {isBottleneck && <span className={classes.warningIcon}>⚠</span>}
                  {stageLabel[stage]}
                </div>
                <div className={[classes.stageCount, isBottleneck ? classes.stageCountBottleneck : count === 0 ? classes.stageCountZero : ''].filter(Boolean).join(' ')}>
                  {count}
                </div>
                <div className={classes.stageUnit}>{T.progress.itemsUnit}</div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
