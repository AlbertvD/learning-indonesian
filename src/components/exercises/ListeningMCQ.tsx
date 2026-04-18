import { useState, useRef, useEffect } from 'react'
import { Box, Button, Stack, Text, Badge, ActionIcon } from '@mantine/core'
import { IconVolume, IconPlayerPlay } from '@tabler/icons-react'
import type { ExerciseItem } from '@/types/learning'
import { translations } from '@/lib/i18n'
import { useAudio } from '@/contexts/AudioContext'
import { resolveAudioUrl } from '@/services/audioService'
import classes from './RecognitionMCQ.module.css'

const MAX_FAILURES = 0

interface ListeningMCQProps {
  exerciseItem: ExerciseItem
  userLanguage: 'en' | 'nl'
  onAnswer: (wasCorrect: boolean, latencyMs: number) => void
}

export function ListeningMCQ({ exerciseItem, userLanguage, onAnswer }: ListeningMCQProps) {
  const t = translations[userLanguage]
  const learningItem = exerciseItem.learningItem!
  const { meanings, distractors } = exerciseItem
  const { audioMap, voiceId } = useAudio()
  const audioUrl = voiceId ? resolveAudioUrl(audioMap, learningItem.base_text, voiceId) : undefined

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  const correctMeaning = meanings.find(m => m.translation_language === userLanguage && m.is_primary)
    ?? meanings.find(m => m.translation_language === userLanguage)
  const correctAnswer = correctMeaning?.translation_text ?? ''

  const allOptions = [correctAnswer, ...(distractors ?? [])].slice(0, 4)
  const [shuffledOptions] = useState(() => [...allOptions].sort(() => Math.random() - 0.5))

  // Autoplay on mount. Rejects on mobile browsers that block autoplay without
  // user gesture — surface a "Tap to play" overlay in that case.
  // Some engines (older Safari, jsdom) return undefined instead of a Promise;
  // treat that as "autoplay blocked" to be safe.
  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    const result = audio.play()
    if (result && typeof result.then === 'function') {
      result.then(() => setHasPlayedOnce(true)).catch(() => setAutoplayBlocked(true))
    } else {
      setAutoplayBlocked(true)
    }
  }, [audioUrl])

  const tapToPlay = () => {
    const audio = audioRef.current
    if (!audio) return
    const result = audio.play()
    if (result && typeof result.then === 'function') {
      result.then(() => {
        setAutoplayBlocked(false)
        setHasPlayedOnce(true)
      }).catch(() => {})
    } else {
      setAutoplayBlocked(false)
      setHasPlayedOnce(true)
    }
  }

  const replay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    const result = audio.play()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  }

  const handleSelectOption = (option: string) => {
    if (isAnswered || !hasPlayedOnce) return
    const isCorrect = option === correctAnswer
    setSelectedOption(option)
    setIsAnswered(true)
    if (isCorrect) {
      setTimeout(() => onAnswer(true, Date.now() - startTime - 1500), 1500)
    } else if (MAX_FAILURES === 0) {
      setTimeout(() => onAnswer(false, Date.now() - startTime), 0)
    }
  }

  if (!audioUrl) {
    return (
      <Box className={classes.container}>
        <Stack gap="xl">
          <Text c="red">
            {userLanguage === 'nl' ? 'Audio niet beschikbaar voor deze oefening.' : 'Audio not available for this exercise.'}
          </Text>
          <Button onClick={() => onAnswer(false, Date.now() - startTime)}>
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
        </Stack>
      </Box>
    )
  }

  const isCorrect = selectedOption === correctAnswer

  return (
    <Box className={classes.container}>
      <Stack gap="xl">
        <Box className={classes.wordSection}>
          <Text size="sm" c="dimmed" mb="xs">
            {userLanguage === 'nl' ? 'Luister en kies de juiste vertaling' : 'Listen and choose the correct translation'}
          </Text>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ActionIcon size="lg" onClick={replay} aria-label="Replay audio">
              <IconVolume size={24} />
            </ActionIcon>
            {isAnswered && (
              <Text size="xl" fw={700}>{learningItem.base_text}</Text>
            )}
          </Box>
        </Box>

        <Stack gap="md">
          {shuffledOptions.map(option => {
            const isSelected = selectedOption === option
            const isCorrectOption = option === correctAnswer
            let statusClass = ''
            if (isAnswered && isSelected) statusClass = isCorrect ? classes.correct : classes.incorrect
            else if (isAnswered && isCorrectOption) statusClass = classes.showCorrect
            return (
              <Button
                key={option}
                onClick={() => handleSelectOption(option)}
                disabled={isAnswered || !hasPlayedOnce}
                className={`${classes.optionButton} ${statusClass}`}
                variant={isSelected ? 'filled' : 'light'}
                fullWidth size="lg"
              >
                {option}
              </Button>
            )
          })}
        </Stack>

        {isAnswered && (
          <Box style={{ textAlign: 'center', marginTop: '32px' }}>
            <Badge color={isCorrect ? 'green' : 'red'} size="xl">
              {isCorrect ? `✓ ${t.session.feedback.correct}` : `✗ ${t.session.feedback.incorrect}`}
            </Badge>
          </Box>
        )}
      </Stack>
    </Box>
  )
}
