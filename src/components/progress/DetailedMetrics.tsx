// src/components/progress/DetailedMetrics.tsx
import { Skeleton } from '@mantine/core'
import classes from './DetailedMetrics.module.css'

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
      <line x1="0" y1="7.2" x2="80" y2="7.2" stroke="rgba(0,229,255,0.15)" strokeWidth="0.5" strokeDasharray="2,2" />
      <text x="1" y="6" fill="rgba(0,229,255,0.35)" fontSize="4" fontFamily="monospace">90%</text>
      <path
        d="M0,2 C12,4 22,8 30,13 C40,19 50,24 62,28 C68,30 74,31.5 80,34"
        fill="none"
        stroke="rgba(0,229,255,0.5)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1={stabilityX} y1="0"
        x2={stabilityX} y2="36"
        stroke="rgba(0,229,255,0.35)"
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
      <div className="section-label">Details</div>

      <div className={classes.grid}>

        {/* Tile 1 — Gem. Stabiliteit */}
        <div className={classes.tile}>
          <TileLabel>Gem. Stabiliteit</TileLabel>
          <div className={classes.tileRow}>
            <span className={classes.bigNum} style={{ color: 'var(--accent-primary)', textShadow: '0 0 10px var(--accent-primary-glow)' }}>
              {avgStability.toFixed(1)}
            </span>
            <ForgettingCurve avgStability={avgStability} />
          </div>
          <div className={classes.tileSub}>
            dagen — na {avgStability.toFixed(1)}d daalt retentie onder 90%
          </div>
        </div>

        {/* Tile 2 — Zwakke Woorden Gered */}
        <div className={classes.tile}>
          <TileLabel>Zwakke Woorden Gered</TileLabel>
          {wave2Loading && lapsePrevention === null ? (
            <Skeleton height={28} width={48} mb={4} />
          ) : (
            <>
              <div className={classes.tileRow} style={{ gap: 10 }}>
                <span className={classes.bigNum} style={{ color: 'var(--success)', textShadow: '0 0 10px rgba(50,215,75,0.4)' }}>
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
              <div className={classes.tileSub}>woorden gered van terugval</div>
              <div className={classes.rescueBar} />
            </>
          )}
        </div>

        {/* Tile 3 — Nauwkeurigheid split */}
        <div className={classes.tile}>
          <TileLabel>Nauwkeurigheid</TileLabel>
          {wave2Loading && accuracyBySkillType === null ? (
            <Skeleton height={28} width={100} mb={4} />
          ) : (
            <>
              <div className={classes.accuracySplit}>
                <div className={classes.accuracyItem}>
                  <div className={classes.accuracyNum} style={{ color: recPct >= 70 ? 'var(--success)' : recPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {recPct}%
                  </div>
                  <div className={classes.accuracyLabel}>MCQ</div>
                </div>
                <div className={classes.accuracyDivider} />
                <div className={classes.accuracyItem}>
                  <div className={classes.accuracyNum} style={{ color: recallPct >= 70 ? 'var(--success)' : recallPct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {recallPct}%
                  </div>
                  <div className={classes.accuracyLabel}>Recall</div>
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

        {/* Tile 4 — Tijd Bespaard */}
        <div className={classes.tile}>
          <TileLabel>Reactietijd</TileLabel>
          {wave2Loading && avgLatencyMs === null ? (
            <Skeleton height={28} width={80} mb={4} />
          ) : currentMs === null ? (
            <div className={classes.tileSub} style={{ marginTop: 8 }}>Nog geen data</div>
          ) : savedMs !== null && savedMs > 0 ? (
            <>
              <div className={classes.tileRow} style={{ alignItems: 'baseline', gap: 4 }}>
                <span className={classes.bigNum} style={{ color: 'var(--success)', textShadow: '0 0 10px rgba(50,215,75,0.4)' }}>
                  {savedSec}
                </span>
                <span className={classes.tileUnit}>s/antwoord sneller</span>
              </div>
              <div className={classes.tileSub}>{priorSec}s → {currentSec}s gem.</div>
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
                <span className={classes.tileUnit}>s/antwoord</span>
              </div>
              <div className={classes.tileSub}>gem. reactietijd deze week</div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
