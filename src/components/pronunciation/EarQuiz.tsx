// "Test je oor" — a two-alternative identification quiz built from the
// pitfall's already-playable minimal pairs (review UP2, docs/plans/2026-07-08-
// uitspraak-quick-wins.md §3). Idle until tapped; each round plays one member
// of a random pair and asks which word was heard. Session-only streak — no
// localStorage, no FSRS, no schema, no telemetry (ADR 0025 posture; revisit
// only if usage argues otherwise).

import { useState, useCallback, useEffect, useRef } from 'react'
import { ActionIcon, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { IconVolume } from '@tabler/icons-react'
import { playSequence } from '@/lib/pronunciation/playSequence'
import { resolveSessionAudioUrl, type SessionAudioMap } from '@/services/audioService'
import { useT } from '@/hooks/useT'
import type { MinimalPair, L1 } from '@/lib/pronunciation/pitfallCatalog'

interface EarQuizProps {
  /** Only pairs whose BOTH member urls resolve in `audioMap` — the parent filters dead pairs out. */
  playablePairs: MinimalPair[]
  audioMap: SessionAudioMap
  language: L1
}

interface Round {
  pair: MinimalPair
  playedMember: 'a' | 'b'
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

  const playWord = useCallback((word: string) => {
    const url = resolveSessionAudioUrl(audioMap, word, null)
    if (url) void playSequence([url])
  }, [audioMap])

  const startRound = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pair = playablePairs[Math.floor(Math.random() * playablePairs.length)]
    const playedMember: 'a' | 'b' = Math.random() < 0.5 ? 'a' : 'b'
    setRound({ pair, playedMember })
    setFeedback(null)
    playWord(playedMember === 'a' ? pair.a : pair.b)
  }, [playablePairs, playWord])

  const handleReplay = useCallback(() => {
    if (!round) return
    playWord(round.playedMember === 'a' ? round.pair.a : round.pair.b)
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
    <Paper withBorder radius="sm" p="xs" mt="xs">
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" tt="uppercase" c="dimmed">{T.pronunciation.quizHeading}</Text>
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
              <Text size="sm" c="green" fw={600}>{T.pronunciation.quizCorrect}</Text>
            )}

            {feedback === 'wrong' && (
              <Stack gap={4}>
                <Text size="sm" c="red" fw={600}>
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
    </Paper>
  )
}
