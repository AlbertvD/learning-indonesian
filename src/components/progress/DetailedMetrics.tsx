// src/components/progress/DetailedMetrics.tsx
import { SimpleGrid, Paper, Text, Skeleton, Box } from '@mantine/core'
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
  wave2Loading: boolean
}

function accuracyColor(pct: number): string {
  if (pct >= 70) return 'var(--success)'
  if (pct >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

function ForgettingCurve({ avgStability }: { avgStability: number }) {
  const stabilityX = Math.min(95, (avgStability / 10) * 100)
  // Estimated y along the curve: approximate from the bezier path
  // At x=0 y≈2, at x=50 y≈18, at x=100 y≈34
  const estimatedY = 18 + (stabilityX / 100) * 16

  return (
    <svg
      viewBox="0 0 100 36"
      width="100%"
      height="36"
      style={{ display: 'block', marginTop: 6 }}
      aria-hidden="true"
    >
      {/* Decay curve */}
      <path
        d="M0,2 C20,4 35,10 50,18 C65,26 78,30 100,34"
        fill="none"
        stroke="#00E5FF"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
      {/* 90% retention horizontal dashed line at y=3.6 (10% from top of 36) */}
      <line
        x1="0"
        y1="3.6"
        x2="100"
        y2="3.6"
        stroke="#00E5FF"
        strokeWidth="0.8"
        strokeOpacity="0.4"
        strokeDasharray="3,2"
      />
      {/* "90%" label */}
      <text
        x="1"
        y="2.8"
        fontSize="3.5"
        fill="#00E5FF"
        fillOpacity="0.6"
        fontFamily="monospace"
      >
        90%
      </text>
      {/* Stability marker vertical dashed line */}
      <line
        x1={stabilityX}
        y1="0"
        x2={stabilityX}
        y2="36"
        stroke="#00E5FF"
        strokeWidth="0.8"
        strokeOpacity="0.4"
        strokeDasharray="3,2"
      />
      {/* Circle at intersection */}
      <circle
        cx={stabilityX}
        cy={estimatedY}
        r="2"
        fill="#00E5FF"
        fillOpacity="0.8"
      />
    </svg>
  )
}

function TileLabel({ children }: { children: string }) {
  return (
    <Text
      size="xs"
      ff="monospace"
      tt="uppercase"
      c="dimmed"
      fw={600}
      mb={4}
      style={{ letterSpacing: '0.06em' }}
    >
      {children}
    </Text>
  )
}

function TileSubtext({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" c="dimmed" mt={4}>
      {children}
    </Text>
  )
}

export function DetailedMetrics({
  avgStability,
  accuracyBySkillType,
  lapsePrevention,
  wave2Loading,
}: DetailedMetricsProps) {
  const recognitionPct = Math.round((accuracyBySkillType?.recognitionAccuracy ?? 0) * 100)
  const recallPct = Math.round((accuracyBySkillType?.recallAccuracy ?? 0) * 100)
  const rescued = lapsePrevention?.rescued ?? 0
  const atRisk = lapsePrevention?.atRisk ?? 0
  const starCount = Math.min(5, rescued)

  return (
    <Box>
      <Text size="sm" fw={600} c="dimmed" tt="uppercase" ff="monospace" mb="sm" style={{ letterSpacing: '0.08em' }}>
        Details
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        {/* Tile 1 — Gemiddelde Stabiliteit */}
        <Paper withBorder p="md">
          <TileLabel>Gem. Stabiliteit</TileLabel>
          <Text
            size="xl"
            fw={700}
            c="cyan"
            className={classes.stabilityValue}
            style={{ lineHeight: 1.2 }}
          >
            {avgStability.toFixed(1)}
          </Text>
          <ForgettingCurve avgStability={avgStability} />
          <TileSubtext>dagen in geheugen</TileSubtext>
        </Paper>

        {/* Tile 2 — Herkenningsnauwkeurigheid */}
        <Paper withBorder p="md">
          <TileLabel>Herkenning</TileLabel>
          {wave2Loading && accuracyBySkillType === null ? (
            <>
              <Skeleton height={28} width={64} mb={4} />
              <Skeleton height={14} width={80} />
            </>
          ) : (
            <>
              <Text
                size="xl"
                fw={700}
                style={{ color: accuracyColor(recognitionPct), lineHeight: 1.2 }}
              >
                {recognitionPct}%
              </Text>
              <TileSubtext>{accuracyBySkillType?.recognitionSampleSize ?? 0} reviews</TileSubtext>
            </>
          )}
        </Paper>

        {/* Tile 3 — Oproepnauwkeurigheid */}
        <Paper withBorder p="md">
          <TileLabel>Oproepen</TileLabel>
          {wave2Loading && accuracyBySkillType === null ? (
            <>
              <Skeleton height={28} width={64} mb={4} />
              <Skeleton height={14} width={80} />
            </>
          ) : (
            <>
              <Text
                size="xl"
                fw={700}
                style={{ color: accuracyColor(recallPct), lineHeight: 1.2 }}
              >
                {recallPct}%
              </Text>
              <TileSubtext>{accuracyBySkillType?.recallSampleSize ?? 0} reviews</TileSubtext>
            </>
          )}
        </Paper>

        {/* Tile 4 — Gered deze week */}
        <Paper withBorder p="md">
          <TileLabel>Gered (7 dgn)</TileLabel>
          {wave2Loading && lapsePrevention === null ? (
            <>
              <Skeleton height={28} width={48} mb={4} />
              <Skeleton height={14} width={90} />
            </>
          ) : (
            <>
              <Text
                size="xl"
                fw={700}
                style={{ color: 'var(--success)', lineHeight: 1.2 }}
              >
                {rescued}
              </Text>
              {starCount > 0 && (
                <Text
                  size="sm"
                  style={{ color: 'var(--mantine-color-yellow-5)', letterSpacing: 2 }}
                  mt={2}
                >
                  {'★'.repeat(starCount)}
                </Text>
              )}
              <TileSubtext>{atRisk} nog at risk</TileSubtext>
            </>
          )}
        </Paper>
      </SimpleGrid>
    </Box>
  )
}
