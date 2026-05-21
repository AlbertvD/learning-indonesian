// src/components/progress/MemoryHealthHero.tsx
import { useState, useEffect } from 'react'
import { useT } from '@/hooks/useT'
import type { translations } from '@/lib/i18n'
import classes from './MemoryHealthHero.module.css'

type TProgress = (typeof translations)['nl']['progress']

interface MemoryHealthHeroProps {
  avgRecognitionDays: number
  avgRecallDays: number
}

function daysToPct(days: number): number {
  return Math.min(100, Math.round((days / 10) * 100))
}

function strengthLabel(pct: number, t: TProgress): { label: string; color: string; cls: string } {
  if (pct >= 70) return { label: t.strengthStrong, color: 'var(--success)', cls: classes.sublabelStrong }
  if (pct >= 40) return { label: t.strengthDeveloping, color: 'var(--warning)', cls: classes.sublabelDeveloping }
  return { label: t.strengthWeak, color: 'var(--danger)', cls: classes.sublabelWeak }
}

const HALF_CIRCUMFERENCE = Math.PI * 62 // ≈ 194.779

interface GaugeCardProps {
  pct: number
  label: string
  directionLabel: string
  strokeColor: string
  glowColor: string
  valueClass: string
}

function GaugeCard({ pct, label, directionLabel, strokeColor, glowColor, valueClass }: GaugeCardProps) {
  const T = useT()
  const [offset, setOffset] = useState(HALF_CIRCUMFERENCE)
  const strength = strengthLabel(pct, T.progress)

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(HALF_CIRCUMFERENCE * (1 - pct / 100))
    }, 100)
    return () => clearTimeout(timer)
  }, [pct])

  return (
    <div className={classes.gaugeCard}>
      {/* Scanline texture */}
      <div className={classes.scanline} aria-hidden="true" />

      <div className={classes.gaugeWrap}>
        <svg viewBox="0 0 160 160" className={classes.gaugeSvg} aria-hidden="true">
          {/* Track — top half only */}
          <circle
            cx={80} cy={80} r={62}
            fill="none"
            stroke="var(--card-border)"
            strokeWidth={12}
            strokeDasharray={`${HALF_CIRCUMFERENCE} ${HALF_CIRCUMFERENCE}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform="rotate(-180 80 80)"
          />
          {/* Fill */}
          <circle
            cx={80} cy={80} r={62}
            fill="none"
            stroke={strokeColor}
            strokeWidth={12}
            strokeDasharray={`${HALF_CIRCUMFERENCE} ${HALF_CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-180 80 80)"
            className={classes.arcFill}
            style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          />
          {/* Tick marks */}
          <line x1="12" y1="80" x2="20" y2="80" stroke="var(--card-border)" strokeWidth="1" />
          <line x1="78" y1="8" x2="78" y2="16" stroke="var(--card-border)" strokeWidth="1" />
          <line x1="140" y1="80" x2="148" y2="80" stroke="var(--card-border)" strokeWidth="1" />
          <text x="5" y="84" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--font-mono)">0</text>
          <text x="69" y="13" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--font-mono)">50</text>
          <text x="131" y="84" fill="var(--text-tertiary)" fontSize="8" fontFamily="var(--font-mono)">100</text>
        </svg>

        {/* Value overlaid at bottom center */}
        <div className={`${classes.gaugeValue} ${valueClass}`} style={{ color: strokeColor }}>
          {pct}%
        </div>
      </div>

      <div className={classes.gaugeLabel}>{label}</div>
      <div className={`${classes.gaugeSublabel} ${strength.cls}`}>{strength.label}</div>
      <div className={classes.gaugeDirection}>{directionLabel}</div>
    </div>
  )
}

export function MemoryHealthHero({ avgRecognitionDays, avgRecallDays }: MemoryHealthHeroProps) {
  const T = useT()
  const recognitionPct = daysToPct(avgRecognitionDays)
  const recallPct = daysToPct(avgRecallDays)
  const gap = recognitionPct - recallPct
  const showGapPill = gap >= 20

  const insightText = gap >= 20
    ? T.progress.insightRecognitionAhead
    : T.progress.insightBalanced

  return (
    <div>
      <div className="section-label">{T.progress.memoryStrength}</div>

      <div className={classes.heroGrid}>
        <GaugeCard
          pct={recognitionPct}
          label={T.progress.recognition}
          directionLabel={T.progress.directionIdToL1}
          strokeColor="var(--accent-primary)"
          glowColor="var(--accent-primary-glow)"
          valueClass={classes.valueRecognition}
        />
        <GaugeCard
          pct={recallPct}
          label={T.progress.recall}
          directionLabel={T.progress.directionL1ToId}
          strokeColor="var(--warning)"
          glowColor="var(--warning-glow)"
          valueClass={classes.valueRecall}
        />
      </div>

      {showGapPill && (
        <div className={classes.gapRow}>
          <span className={classes.gapRowLabel}>{T.progress.gapAnalysis}</span>
          <div className={classes.gapPill}>
            <span className={classes.gapPillText}>{gap}% {T.progress.gapLabel}</span>
          </div>
        </div>
      )}

      <div className={classes.insightBox}>
        <span className={classes.insightIcon}>💡</span>
        <p className={classes.insightText}>{insightText}</p>
      </div>
    </div>
  )
}
