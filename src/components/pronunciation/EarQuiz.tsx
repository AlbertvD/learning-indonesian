// "Test je oor" — a two-alternative identification quiz built from the
// pitfall's already-playable minimal pairs (review UP2, docs/plans/2026-07-08-
// uitspraak-quick-wins.md §3). Idle until tapped; each round plays one member
// of a random pair and asks which word was heard. Session-only streak — no
// localStorage, no FSRS, no schema, no telemetry (ADR 0025 posture; revisit
// only if usage argues otherwise).
//
// Voice variability (review UP3, docs/plans/2026-07-09-uitspraak-round2.md
// §1): each round picks a random voice among PAIR_DRILL_VOICES that resolves
// for the played word (HVPT talker variability — hearing the contrast in more
// than one voice trains the actual phoneme, not one speaker's rendition).
// Falls back to the default (null) voice when none of the paired voices have
// a seeded clip yet, so an unseeded pair never breaks the quiz. The chosen
// voice is held for the round so replay repeats the same clip.

import { useState, useCallback, useEffect, useRef } from 'react'
import { ActionIcon, Button, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import classes from './EarQuiz.module.css'
import { playSequence } from '@/lib/pronunciation/playSequence'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { useT } from '@/hooks/useT'
import { PAIR_DRILL_VOICES, type MinimalPair, type L1 } from '@/lib/pronunciation/pitfallCatalog'

interface EarQuizProps {
  /** Only pairs whose BOTH member urls resolve in `audioMap` — the parent filters dead pairs out. */
  playablePairs: MinimalPair[]
  audioMap: SessionAudioMap
  language: L1
}

interface Round {
  pair: MinimalPair
  playedMember: 'a' | 'b'
  /** The voice this round's clip was played in — null is the default/voice-agnostic clip. */
  voiceId: string | null
}

export function EarQuiz({ playablePairs, audioMap }: EarQuizProps) {
  const T = useT()
  const [round, setRound] = useState<Round | null>(null)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [streak, setStreak] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear a pending auto-advance if the card unmounts mid-round (e.g. an L1
  // toggle) — a stray timer must never fire after unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const playWord = useCallback((word: string, voiceId: string | null) => {
    const url = resolveSessionAudioUrl(audioMap, word, voiceId)
    if (url) void playSequence([url])
  }, [audioMap])

  // Random voice among PAIR_DRILL_VOICES that actually resolves for this word;
  // falls back to the default (null) voice when none of them do.
  const pickVoiceForWord = useCallback((word: string): string | null => {
    const resolving = PAIR_DRILL_VOICES.filter((v) => Boolean(resolveSessionAudioUrl(audioMap, word, v)))
    if (resolving.length === 0) return null
    return resolving[Math.floor(Math.random() * resolving.length)]
  }, [audioMap])

  const startRound = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pair = playablePairs[Math.floor(Math.random() * playablePairs.length)]
    const playedMember: 'a' | 'b' = Math.random() < 0.5 ? 'a' : 'b'
    const playedWord = playedMember === 'a' ? pair.a : pair.b
    const voiceId = pickVoiceForWord(playedWord)
    setRound({ pair, playedMember, voiceId })
    setFeedback(null)
    playWord(playedWord, voiceId)
  }, [playablePairs, playWord, pickVoiceForWord])

  const handleReplay = useCallback(() => {
    if (!round) return
    playWord(round.playedMember === 'a' ? round.pair.a : round.pair.b, round.voiceId)
  }, [round, playWord])

  const handleAnswer = useCallback((word: string) => {
    if (!round || feedback !== null) return
    const correctWord = round.playedMember === 'a' ? round.pair.a : round.pair.b
    if (word === correctWord) {
      setFeedback('correct')
      setStreak((s) => s + 1)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        startRound()
      }, 800)
    } else {
      setFeedback('wrong')
      setStreak(0)
    }
  }, [round, feedback, startRound])

  if (playablePairs.length === 0) return null

  return (
    <div className={classes.subCard}>
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <span className="eyebrow">{T.pronunciation.quizHeading}</span>
          {round && (
            <Tooltip label={T.pronunciation.quizReplay} withArrow>
              <ActionIcon
                variant="subtle"
                size="xs"
                onClick={handleReplay}
                aria-label={T.pronunciation.quizReplay}
              >
                <IconVolume size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {!round ? (
          <Button size="compact-xs" variant="light" onClick={startRound}>
            {T.pronunciation.quizStart}
          </Button>
        ) : (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">{T.pronunciation.quizPrompt}</Text>
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="light"
                disabled={feedback !== null}
                onClick={() => handleAnswer(round.pair.a)}
              >
                {round.pair.a}
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                disabled={feedback !== null}
                onClick={() => handleAnswer(round.pair.b)}
              >
                {round.pair.b}
              </Button>
            </Group>

            {feedback === 'correct' && (
              <Text size="sm" fw={600} className={classes.correct}>{T.pronunciation.quizCorrect}</Text>
            )}

            {feedback === 'wrong' && (
              <Stack gap={4}>
                <Text size="sm" fw={600} className={classes.wrong}>
                  {T.pronunciation.quizWrongWas} {round.playedMember === 'a' ? round.pair.a : round.pair.b}
                </Text>
                <Button size="compact-xs" variant="light" onClick={startRound}>
                  {T.pronunciation.quizNext}
                </Button>
              </Stack>
            )}

            <Text size="xs" c="dimmed">{T.pronunciation.quizStreak}: {streak}</Text>
          </Stack>
        )}
      </Stack>
    </div>
  )
}
