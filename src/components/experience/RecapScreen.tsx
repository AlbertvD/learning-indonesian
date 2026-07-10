import { Link } from 'react-router-dom'
import { Stack, Button, Text, SimpleGrid } from '@mantine/core'
import { HeroCard, StatCard, SectionHeading } from '@/components/page/primitives'
import { capabilityDisplay } from '@/lib/session-builder'
import type { SessionBlock } from '@/lib/session-builder'
import { translations } from '@/lib/i18n'
import classes from './RecapScreen.module.css'

// Why an empty session came up empty (ux audit MAJ-3, desktop program slice 3):
// "no lesson active" needs a diagnosis + CTA to Leren; "caught up" is a
// positive state that points onward to Ontdek. Undefined keeps the generic
// copy (scoped modes and older callers).
export type EmptySessionReason = 'no_active_lesson' | 'caught_up'

/** First-attempt verdict per block id — the datum the recap accuracy + breakdown
 *  are built from. A block with no entry was never answered (skipped / not reached). */
export type FirstAttemptOutcome = 'correct' | 'fuzzy' | 'wrong'

interface RecapScreenProps {
  renderableBlocks: SessionBlock[]
  answeredBlocks: Set<string>
  skippedBlocks: Set<string>
  commitFailedBlocks: Set<string>
  /** First-attempt outcome per block id (ExperiencePlayer records it once, on the
   *  non-drill answer). Optional so the empty-session callers need not pass it. */
  firstAttemptOutcomes?: Map<string, FirstAttemptOutcome>
  // Leave the recap (navigate home). Completion is recorded by the player when
  // the cards run out, not here — so this is navigation only.
  onExit: () => void
  userLanguage: 'nl' | 'en'
  emptyReason?: EmptySessionReason
}

interface CapabilityTally {
  label: string
  total: number
  correct: number
  close: number
  wrong: number
}

export function RecapScreen({
  renderableBlocks,
  answeredBlocks,
  skippedBlocks,
  commitFailedBlocks,
  firstAttemptOutcomes = new Map(),
  onExit,
  userLanguage,
  emptyReason,
}: RecapScreenProps) {
  const T = translations[userLanguage]

  if (renderableBlocks.length === 0) {
    const empty =
      emptyReason === 'no_active_lesson'
        ? { title: T.recap.emptyNoLessonTitle, message: T.recap.emptyNoLessonMessage, cta: T.recap.emptyNoLessonCta, to: '/leren' }
        : emptyReason === 'caught_up'
          ? { title: T.recap.emptyCaughtUpTitle, message: T.recap.emptyCaughtUpMessage, cta: T.recap.emptyCaughtUpCta, to: '/ontdek' }
          : { title: T.recap.emptyTitle, message: T.recap.emptyMessage, cta: null, to: null }

    return (
      <Stack gap="md" data-testid="session-recap">
        <HeroCard title={empty.title}>
          <Text>{empty.message}</Text>
        </HeroCard>
        {empty.cta && empty.to && (
          <Button component={Link} to={empty.to} fullWidth>
            {empty.cta}
          </Button>
        )}
        <Button variant={empty.cta ? 'default' : 'filled'} onClick={onExit} fullWidth>
          {T.recap.backToDashboard}
        </Button>
      </Stack>
    )
  }

  const effectiveTotal = renderableBlocks.length

  const savedBlocks = renderableBlocks.filter(
    b => answeredBlocks.has(b.id) && !skippedBlocks.has(b.id) && !commitFailedBlocks.has(b.id),
  )
  const savedCount = savedBlocks.length
  const savedDue = savedBlocks.filter(b => b.kind === 'due_review').length
  const savedNew = savedBlocks.filter(b => b.kind === 'new_introduction').length
  const failedCount = commitFailedBlocks.size

  // Accuracy is measured on FIRST attempts only (a redrill getting it right
  // later doesn't rewrite the first-try verdict). `attempts` is the number of
  // cards the learner actually answered (skips have no outcome).
  const outcomeOf = (id: string) => firstAttemptOutcomes.get(id)
  const attempts = firstAttemptOutcomes.size
  const firstTryCorrect = renderableBlocks.filter(b => outcomeOf(b.id) === 'correct').length
  const mistakes = attempts - firstTryCorrect
  const accuracy = attempts > 0 ? Math.round((firstTryCorrect / attempts) * 100) : null

  // Longest streak of consecutive first-try-correct answers, in the order the
  // learner answered (the Map preserves insertion order). A wrong/fuzzy breaks
  // the run; a skip has no outcome and is simply absent from the sequence.
  let longestCleanRun = 0
  let currentRun = 0
  for (const outcome of firstAttemptOutcomes.values()) {
    if (outcome === 'correct') {
      currentRun += 1
      if (currentRun > longestCleanRun) longestCleanRun = currentRun
    } else {
      currentRun = 0
    }
  }

  // Flawless = every card answered (nothing skipped or left untouched) AND no
  // mistakes. This is the whole-session celebration, distinct from a long run.
  const flawless = effectiveTotal > 0 && attempts === effectiveTotal && mistakes === 0

  // Confetti colour cycle (celebration only). Semantic + brand tokens.
  const confettiColors = ['var(--success)', 'var(--warning)', 'var(--accent-primary)', 'var(--teal)']

  // Breakdown per capability, largest group first. Each block is counted once
  // (renderableBlocks holds each capability's session block a single time).
  const tallyMap = new Map<string, CapabilityTally>()
  for (const b of renderableBlocks) {
    const label = capabilityDisplay(b.renderPlan.capabilityType).label
    const tally = tallyMap.get(label) ?? { label, total: 0, correct: 0, close: 0, wrong: 0 }
    tally.total += 1
    const outcome = outcomeOf(b.id)
    if (outcome === 'correct') tally.correct += 1
    else if (outcome === 'fuzzy') tally.close += 1
    else if (outcome === 'wrong') tally.wrong += 1
    tallyMap.set(label, tally)
  }
  const breakdown = [...tallyMap.values()].sort((a, b) => b.total - a.total)
  const anyClose = breakdown.some(t => t.close > 0)

  return (
    <Stack gap="md" data-testid="session-recap">
      <HeroCard title={flawless ? T.recap.flawlessTitle : T.recap.completedTitle}>
        {flawless ? (
          <div className={classes.celebrate}>
            <div className={classes.confetti} aria-hidden="true">
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className={classes.confettiPiece}
                  style={{
                    left: `${(i / 15) * 100}%`,
                    backgroundColor: confettiColors[i % confettiColors.length],
                    animationDelay: `${(i % 8) * 0.12}s`,
                  }}
                />
              ))}
            </div>
            <Text className={classes.flawlessMsg}>{T.recap.flawlessMessage(attempts)}</Text>
          </div>
        ) : (
          <Stack gap="xs">
            <Text>{T.recap.savedSummary(savedCount, effectiveTotal)}</Text>
            {failedCount === 1 && (
              <Text c="dimmed" size="sm">{T.recap.failedSingular}</Text>
            )}
            {failedCount >= 2 && (
              <Text c="dimmed" size="sm">{T.recap.failedPlural(failedCount)}</Text>
            )}
          </Stack>
        )}
      </HeroCard>

      <SimpleGrid cols={3} spacing="sm">
        <StatCard
          label={T.recap.accuracy}
          value={
            <span className={`${classes.metric} ${accuracy !== null && accuracy >= 80 ? classes.metricGood : ''}`}>
              {accuracy !== null ? `${accuracy}%` : '—'}
            </span>
          }
        />
        <StatCard
          label={T.recap.firstTryCorrect}
          value={<span className={classes.metric}>{firstTryCorrect}<span className={classes.metricSub}>/ {attempts}</span></span>}
        />
        <StatCard
          label={T.recap.mistakes}
          value={<span className={`${classes.metric} ${mistakes > 0 ? classes.metricWarn : ''}`}>{mistakes}</span>}
        />
      </SimpleGrid>

      {longestCleanRun > 0 && (
        <div className={classes.streakWrap}>
          <div className={`${classes.streak} ${flawless ? classes.streakGold : ''}`}>
            <span className={classes.streakIcon} aria-hidden="true">🔥</span>
            <span className={classes.streakLabel}>{T.recap.longestRun}</span>
            <span className={classes.streakValue}>{T.recap.runInARow(longestCleanRun)}</span>
          </div>
        </div>
      )}

      <Text className={classes.tally}>
        {T.recap.tallyCaption(savedDue, savedNew)}
      </Text>

      <SectionHeading>{T.recap.perSkill}</SectionHeading>
      <div className={classes.breakdown}>
        {breakdown.map(tally => {
          const pct = (n: number) => (tally.total > 0 ? (n / tally.total) * 100 : 0)
          return (
            <div className={classes.row} key={tally.label}>
              <div className={classes.rowHead}>
                <span className={classes.rowLabel}>{tally.label}</span>
                <span className={classes.rowCount}>{T.recap.cardsCount(tally.total)}</span>
              </div>
              <div
                className={classes.bar}
                role="img"
                aria-label={`${tally.label}: ${T.recap.breakdownSummary(tally.correct, tally.total)}`}
              >
                {tally.correct > 0 && (
                  <span className={`${classes.seg} ${classes.segCorrect}`} style={{ width: `${pct(tally.correct)}%` }} />
                )}
                {tally.close > 0 && (
                  <span className={`${classes.seg} ${classes.segClose}`} style={{ width: `${pct(tally.close)}%` }} />
                )}
                {tally.wrong > 0 && (
                  <span className={`${classes.seg} ${classes.segWrong}`} style={{ width: `${pct(tally.wrong)}%` }} />
                )}
              </div>
              <span className={classes.rowSummary}>
                {T.recap.breakdownSummary(tally.correct, tally.total)}
              </span>
            </div>
          )
        })}
      </div>

      <div className={classes.legend}>
        <span className={classes.legendItem}>
          <span className={`${classes.swatch} ${classes.swatchCorrect}`} />{T.recap.legendCorrect}
        </span>
        {anyClose && (
          <span className={classes.legendItem}>
            <span className={`${classes.swatch} ${classes.swatchClose}`} />{T.recap.legendClose}
          </span>
        )}
        <span className={classes.legendItem}>
          <span className={`${classes.swatch} ${classes.swatchWrong}`} />{T.recap.legendWrong}
        </span>
      </div>

      <Button onClick={onExit} fullWidth>
        {T.recap.backToDashboard}
      </Button>
    </Stack>
  )
}
