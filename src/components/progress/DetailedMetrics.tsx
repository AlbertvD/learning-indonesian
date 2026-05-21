// src/components/progress/DetailedMetrics.tsx
import { Skeleton } from '@mantine/core'
import { useT } from '@/hooks/useT'
import classes from './DetailedMetrics.module.css'

function fillTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

interface DetailedMetricsProps {
  avgStability: number
  accuracyBySkillType: {
    recognitionAccuracy: number
    recognitionSampleSize: number
    recallAccuracy: number
    recallSampleSize: number
  } | null
  lapsePrevention: { atRisk: number; rescued: number } | null
  avgLatencyMs: { currentWeekMs: number | null; priorWeekMs: number | null } | null
  wave2Loading: boolean
}

function ForgettingCurve({ avgStability }: { avgStability: number }) {
  const stabilityX = Math.min(95, (avgStability / 10) * 100)
  const estimatedY = 18 + (stabilityX / 100) * 16

  return (
    <svg viewBox="0 0 80 36" className={classes.curvesvg} aria-hidden="true">
      <line x1="0" y1="7.2" x2="80" y2="7.2" stroke="var(--accent-primary-border)" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x="1" y="6" fill="var(--accent-primary-border)" fontSize="4" fontFamily="var(--font-mono)">90%</text>
      <path
        d="M0,2 C12,4 22,8 30,13 C40,19 50,24 62,28 C68,30 74,31.5 80,34"
        fill="none"
        stroke="var(--accent-primary-dim)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1={stabilityX} y1="0"
        x2={stabilityX} y2="36"
        stroke="var(--accent-primary-border)"
        strokeWidth="0.8"
        strokeDasharray="1.5,1.5"
      />
      <circle cx={stabilityX} cy={estimatedY} r="2" fill="var(--accent-primary)" />
    </svg>
  )
}

function TileLabel({ children }: { children: string }) {
  return <div className={classes.tileLabel}>{children}</div>
}

export function DetailedMetrics({
  avgStability,
  accuracyBySkillType,
  lapsePrevention,
  avgLatencyMs,
  wave2Loading,
}: DetailedMetricsProps) {
  const T = useT()
  const recPct = Math.round((accuracyBySkillType?.recognitionAccuracy ?? 0) * 100)
  const recallPct = Math.round((accuracyBySkillType?.recallAccuracy ?? 0) * 100)
  const rescued = lapsePrevention?.rescued ?? 0
  const starCount = Math.min(5, rescued)

  const currentMs = avgLatencyMs?.currentWeekMs ?? null
  const priorMs = avgLatencyMs?.priorWeekMs ?? null
  const savedMs = currentMs !== null && priorMs !== null ? priorMs - currentMs : null
  const savedSec = savedMs !== null ? (savedMs / 1000).toFixed(1) : null
  const currentSec = currentMs !== null ? (currentMs / 1000).toFixed(1) : null
  const priorSec = priorMs !== null ? (priorMs / 1000).toFixed(1) : null

  return (
    <div>
      <div className="section-label">{T.progress.detailsTitle}</div>

      <div className={classes.grid}>

        {/* Tile 1 — Avg. Stability */}
        <div className={classes.tile}>
          <TileLabel>{T.progress.avgStability}</TileLabel>
          <div className={classes.tileRow}>
            <span className={classes.bigNum} style={{ color: 'var(--accent-primary)', textShadow: '0 0 10px var(--accent-primary-glow)' }}>
              {avgStability.toFixed(1)}
            </span>
            <ForgettingCurve avgStability={avgStability} />
          </div>
          <div className={classes.tileSub}>
            {fillTemplate(T.progress.stabilityHint, { n: avgStability.toFixed(1) })}
          </div>
        </div>

        {/* Tile 2 — Weak Words Rescued */}
        <div className={classes.tile}>
          <TileLabel>{T.progress.rescuedTitle}</TileLabel>
          {wave2Loading && lapsePrevention === null ? (
            <Skeleton height={28} width={48} mb={4} />
          ) : (
            <>
              <div className={classes.tileRow} style={{ gap: 10 }}>
                <span className={classes.bigNum} style={{ color: 'var(--success)', textShadow: '0 0 10px var(--success-glow)' }}>
                  {rescued}
                </span>
                {starCount > 0 && (
                  <div className={classes.rescueBadges}>
                    {Array.from({ length: starCount }).map((_, i) => (
                      <span key={i} className={classes.rescueBadge} style={{ animationDelay: `${i * 0.08}s` }}>★</span>
                    ))}
                  </div>
                )}
              </div>
              <div className={classes.tileSub}>{T.progress.rescuedSub}</div>
              <div className={classes.rescueBar} />
            </>
          )}
        </div>

        {/* Tile 3 — Accuracy split */}
        <div className={classes.tile}>
          <TileLabel>{T.progress.accuracyTitle}</TileLabel>
          {wave2Loading && accuracyBySkillType === null ? (
            <Skeleton height={28} width={100} mb={4} />
          ) : (
            <>
              <div className={classes.accuracySplit}>
                <div className={classes.accuracyItem}>
                  <div className={classes.accuracyNum} style={{ color: recPct >= 70 ? 'var(--success)' : recPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {recPct}%
                  </div>
                  <div className={classes.accuracyLabel}>{T.progress.accuracyMcq}</div>
                </div>
                <div className={classes.accuracyDivider} />
                <div className={classes.accuracyItem}>
                  <div className={classes.accuracyNum} style={{ color: recallPct >= 70 ? 'var(--success)' : recallPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {recallPct}%
                  </div>
                  <div className={classes.accuracyLabel}>{T.progress.accuracyRecall}</div>
                </div>
              </div>
              <div className={classes.accuracyTrack}>
                <div
                  className={classes.accuracyFill}
                  style={{ width: `${recPct}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Tile 4 — Response Time */}
        <div className={classes.tile}>
          <TileLabel>{T.progress.responseTime}</TileLabel>
          {wave2Loading && avgLatencyMs === null ? (
            <Skeleton height={28} width={80} mb={4} />
          ) : currentMs === null ? (
            <div className={classes.tileSub} style={{ marginTop: 8 }}>{T.progress.noData}</div>
          ) : savedMs !== null && savedMs > 0 ? (
            <>
              <div className={classes.tileRow} style={{ alignItems: 'baseline', gap: 4 }}>
                <span className={classes.bigNum} style={{ color: 'var(--success)', textShadow: '0 0 10px var(--success-glow)' }}>
                  {savedSec}
                </span>
                <span className={classes.tileUnit}>{T.progress.fasterPerAnswer}</span>
              </div>
              <div className={classes.tileSub}>{priorSec}s → {currentSec}s</div>
              <div className={classes.speedBar}>
                <div className={classes.speedBarLabel}>{priorSec}s</div>
                <div className={classes.speedTrack}>
                  <div className={classes.speedFill} style={{ width: `${Math.min(100, (Number(savedMs) / Number(priorMs)) * 100)}%` }} />
                </div>
                <div className={classes.speedBarLabel} style={{ color: 'var(--success)' }}>{currentSec}s</div>
              </div>
            </>
          ) : (
            <>
              <div className={classes.tileRow} style={{ alignItems: 'baseline', gap: 4 }}>
                <span className={classes.bigNum} style={{ color: 'var(--text-secondary)' }}>
                  {currentSec}
                </span>
                <span className={classes.tileUnit}>{T.progress.perAnswer}</span>
              </div>
              <div className={classes.tileSub}>{T.progress.avgThisWeek}</div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
