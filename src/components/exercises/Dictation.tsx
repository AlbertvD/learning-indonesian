import { useState, useRef, useEffect } from 'react'
import { Box, Button, Stack, Text, Badge, ActionIcon, TextInput } from '@mantine/core'
import { IconVolume, IconPlayerPlay, IconArrowRight } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { checkAnswer } from '@/lib/answerNormalization'
import { translations } from '@/lib/i18n'
import { useAudio } from '@/contexts/AudioContext'
import { resolveAudioUrl } from '@/services/audioService'
import classes from './TypedRecall.module.css'

interface DictationProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, isFuzzy: boolean, latencyMs: number, rawResponse: string) => void
}

export function Dictation({ exerciseItem, userLanguage, onAnswer }: DictationProps) {
  const t = translations[userLanguage]
  const learningItem = exerciseItem.learningItem!
  const { audioMap, voiceId } = useAudio()
  const audioUrl = voiceId ? resolveAudioUrl(audioMap, learningItem.base_text, voiceId) : undefined

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [response, setResponse] = useState('')
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const variants = (exerciseItem.answerVariants ?? []).map(v => v.variant_text)
  const result = checkAnswer(response, learningItem.base_text, variants)

  // Autoplay. Defensive for engines returning non-Promise (older Safari, jsdom).
  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    const p = audio.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        setHasPlayedOnce(true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }).catch(() => setAutoplayBlocked(true))
    } else {
      // Engine returned undefined (older Safari, jsdom) — defer the state
      // update to avoid the cascading-renders lint warning.
      queueMicrotask(() => setAutoplayBlocked(true))
    }
  }, [audioUrl])

  const tapToPlay = () => {
    const audio = audioRef.current
    if (!audio) return
    const p = audio.play()
    const onOk = () => {
      setAutoplayBlocked(false)
      setHasPlayedOnce(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    if (p && typeof p.then === 'function') p.then(onOk).catch(() => {})
    else onOk()
  }

  const replay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    const p = audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }

  const handleSubmit = () => {
    if (isAnswered || !response.trim() || !hasPlayedOnce) return
    setIsAnswered(true)
    const FEEDBACK_DELAY_MS = result.isCorrect ? 1500 : 0
    setTimeout(() => {
      onAnswer(result.isCorrect, result.isFuzzy, Date.now() - startTime - FEEDBACK_DELAY_MS, response)
    }, FEEDBACK_DELAY_MS)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAnswered) handleSubmit()
  }

  if (!audioUrl) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          <Text c="red">
            {userLanguage === 'nl' ? 'Audio niet beschikbaar voor deze oefening.' : 'Audio not available for this exercise.'}
          </Text>
          <Button onClick={() => onAnswer(false, false, Date.now() - startTime, '')}>
            {userLanguage === 'nl' ? 'Doorgaan' : 'Continue'}
          </Button>
        </Stack>
      </Box>
    )
  }

  if (autoplayBlocked) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl" align="center">
          <Text size="lg">
            {userLanguage === 'nl' ? 'Klik om af te spelen' : 'Tap to play'}
          </Text>
          <ActionIcon size="xl" onClick={tapToPlay} aria-label="Play audio">
            <IconPlayerPlay size={32} />
          </ActionIcon>
          <TextInput disabled value="" size="lg" placeholder={t.session.recall.placeholder} />
        </Stack>
      </Box>
    )
  }

  const isCorrect = result.isCorrect

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Box className={classes.promptSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Luister en typ wat je hoort' : 'Listen and type what you hear'}
          </Text>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActionIcon size="lg" onClick={replay} aria-label="Replay audio">
              <IconVolume size={24} />
            </ActionIcon>
            {isAnswered && (
              <Text size="xl" fw={700} c={isCorrect ? 'green' : 'red'}>
                {learningItem.base_text}
              </Text>
            )}
          </Box>
        </Box>

        <Box>
          <TextInput
            ref={inputRef}
            value={response}
            onChange={(e) => setResponse(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={isAnswered || !hasPlayedOnce}
            size="lg"
            placeholder={t.session.recall.placeholder}
            aria-label="Dictation answer input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Box>

        {!isAnswered && (
          <Button
            onClick={handleSubmit}
            disabled={!response.trim() || !hasPlayedOnce}
            size="lg"
            fullWidth
            rightSection={<IconArrowRight size={18} />}
          >
            {t.session.feedback.check}
          </Button>
        )}

        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color={isCorrect ? 'green' : 'red'} size="xl">
              {isCorrect
                ? (result.isFuzzy ? t.session.feedback.almostCorrect : t.session.feedback.correct)
                : `✗ ${t.session.feedback.incorrect}`}
            </Badge>
            {/* Side-by-side reveal for fuzzy-corrects and wrong answers — Spec 4
                silent-mis-teach mitigation. Without the meaning cue that
                typed_recall has, a fuzzy-accept on tahu→tahun would otherwise
                pass silently. Showing both forms makes the discrepancy visible. */}
            {(result.isFuzzy || !isCorrect) && (
              <Box mt="lg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Box>
                  <Text size="xs" c="dimmed">
                    {userLanguage === 'nl' ? 'Je typte' : 'You typed'}
                  </Text>
                  <Text size="lg" fw={600}>{response}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    {userLanguage === 'nl' ? 'Doel' : 'Target'}
                  </Text>
                  <Text size="lg" fw={600} c="green">{learningItem.base_text}</Text>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
