export interface AudioExposureInput {
  durationSeconds: number
  playedSeconds: number
  completed: boolean
}

export interface TextExposureInput {
  visibleSeconds: number
  meaningfulScroll: boolean
}

export interface LessonExposureSignals {
  hasDialogue: boolean
  grammarAudio?: AudioExposureInput
  grammarText?: TextExposureInput
  dialogueAudio?: AudioExposureInput
  dialogueText?: TextExposureInput
}

export interface LessonReadiness {
  grammarReady: boolean
  wordsAndSentencesReady: boolean
  meaningfulExposure: boolean
}

const LONG_GRAMMAR_AUDIO_SECONDS = 5 * 60
const GRAMMAR_AUDIO_RATIO = 0.6
const DIALOGUE_SHORT_AUDIO_SECONDS = 60
const DIALOGUE_AUDIO_RATIO = 0.6
const TEXT_EXPOSURE_SECONDS = 2 * 60

function validDuration(input: AudioExposureInput): boolean {
  return Number.isFinite(input.durationSeconds) && input.durationSeconds > 0
}

function playbackRatio(input: AudioExposureInput): number {
  if (!validDuration(input)) return 0
  return input.playedSeconds / input.durationSeconds
}

export function isMeaningfulGrammarAudio(input: AudioExposureInput): boolean {
  if (!validDuration(input)) return false
  if (input.durationSeconds < LONG_GRAMMAR_AUDIO_SECONDS) {
    return input.completed
  }

  return (
    input.playedSeconds >= LONG_GRAMMAR_AUDIO_SECONDS
    && playbackRatio(input) >= GRAMMAR_AUDIO_RATIO
  )
}

export function isMeaningfulDialogueAudio(input: AudioExposureInput): boolean {
  if (!validDuration(input)) return false
  if (input.durationSeconds < DIALOGUE_SHORT_AUDIO_SECONDS) {
    return input.completed
  }

  return input.completed || playbackRatio(input) >= DIALOGUE_AUDIO_RATIO
}

export function isMeaningfulTextExposure(input: TextExposureInput): boolean {
  return input.meaningfulScroll || input.visibleSeconds >= TEXT_EXPOSURE_SECONDS
}

export function decideLessonReadiness(input: LessonExposureSignals): LessonReadiness {
  const grammarReady = Boolean(
    (input.grammarAudio && isMeaningfulGrammarAudio(input.grammarAudio))
    || (input.grammarText && isMeaningfulTextExposure(input.grammarText)),
  )

  const dialogueReady = Boolean(
    (input.dialogueAudio && isMeaningfulDialogueAudio(input.dialogueAudio))
    || (input.dialogueText && isMeaningfulTextExposure(input.dialogueText)),
  )

  const wordsAndSentencesReady = input.hasDialogue ? dialogueReady : grammarReady

  return {
    grammarReady,
    wordsAndSentencesReady,
    meaningfulExposure: grammarReady || wordsAndSentencesReady,
  }
}
