// src/components/progress/MemoryHealthHero.tsx
import { useState, useEffect } from 'react'
import { SimpleGrid, Paper, Text, Badge, Box } from '@mantine/core'
import classes from './MemoryHealthHero.module.css'

interface MemoryHealthHeroProps {
  avgRecognitionDays: number
  avgRecallDays: number
}

function daysToPct(days: number): number {
  return Math.min(100, Math.round((days / 10) * 100))
}

function strengthLabel(pct: number): { label: string; color: string } {
  if (pct >= 70) return { label: 'Sterk', color: 'var(--success)' }
  if (pct >= 40) return { label: 'Ontwikkelen', color: 'var(--mantine-color-cyan-4)' }
  return { label: 'Zwak', color: 'var(--warning)' }
}

const HALF_CIRCUMFERENCE = Math.PI * 62 // ≈ 194.779

interface GaugeCardProps {
  pct: number
  label: string
  directionLabel: string
  strokeColor: string
}

function GaugeCard({ pct, label, directionLabel, strokeColor }: GaugeCardProps) {
  const [offset, setOffset] = useState(HALF_CIRCUMFERENCE)
  const strength = strengthLabel(pct)

  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(HALF_CIRCUMFERENCE * (1 - pct / 100))
    }, 100)
    return () => clearTimeout(timer)
  }, [pct])

  return (
    <Paper withBorder p="lg" className={classes.gaugeCard}>
      <div className={classes.svgContainer}>
        <svg viewBox="0 0 160 88" className={classes.gaugeSvg} aria-hidden="true">
          {/* Track */}
          <circle
            cx={80}
            cy={80}
            r={62}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={10}
            strokeDasharray={HALF_CIRCUMFERENCE}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform="rotate(-180 80 80)"
          />
          {/* Fill */}
          <circle
            cx={80}
            cy={80}
            r={62}
            fill="none"
            stroke={strokeColor}
            strokeWidth={10}
            strokeDasharray={HALF_CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-180 80 80)"
            className={classes.arcFill}
          />
        </svg>
        <div className={classes.gaugeCenter}>
          <Text className={classes.pctText} fw={700}>
            {pct}%
          </Text>
        </div>
      </div>

      <Text ta="center" fw={600} size="sm" mt="xs">
        {label}
      </Text>
      <Text ta="center" size="xs" style={{ color: strength.color }} fw={500} mt={2}>
        {strength.label}
      </Text>
      <Text ta="center" size="xs" c="dimmed" mt={4}>
        {directionLabel}
      </Text>
    </Paper>
  )
}

export function MemoryHealthHero({ avgRecognitionDays, avgRecallDays }: MemoryHealthHeroProps) {
  const recognitionPct = daysToPct(avgRecognitionDays)
  const recallPct = daysToPct(avgRecallDays)
  const gap = recognitionPct - recallPct
  const showGapPill = Math.abs(gap) >= 20

  const insightText =
    gap >= 20
      ? "Je herkenning is sterk, maar je oproepen loopt achter. Het algoritme geeft prioriteit aan 'Typed Recall' oefeningen om de kloof te overbruggen."
      : 'Je geheugenbalans ziet er goed uit. Blijf consistent oefenen.'

  return (
    <Box>
      <Text
        size="sm"
        c="dimmed"
        tt="uppercase"
        mb="sm"
        style={{ letterSpacing: '0.1em', fontWeight: 500 }}
      >
        Geheugensterkte
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <GaugeCard
          pct={recognitionPct}
          label="Herkenning"
          directionLabel="Indonesisch → NL/EN"
          strokeColor="var(--accent-primary)"
        />
        <GaugeCard
          pct={recallPct}
          label="Oproepen"
          directionLabel="NL/EN → Indonesisch"
          strokeColor="#BF5AF2"
        />
      </SimpleGrid>

      {showGapPill && (
        <Box mt="sm">
          <Badge color={gap > 0 ? 'orange' : 'teal'} variant="light">
            {gap > 0
              ? `Oproepen loopt ${gap}% achter`
              : 'Oproepen is sterk'}
          </Badge>
        </Box>
      )}

      <Box className={classes.insightBox} mt="sm">
        <Text size="sm">{insightText}</Text>
      </Box>
    </Box>
  )
}
