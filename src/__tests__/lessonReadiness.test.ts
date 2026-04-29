import { describe, expect, it } from 'vitest'
import {
  decideLessonReadiness,
  isMeaningfulDialogueAudio,
  isMeaningfulGrammarAudio,
  isMeaningfulTextExposure,
} from '@/lib/lessons/lessonReadiness'

describe('lesson readiness', () => {
  it('requires short grammar audio to be completed once', () => {
    expect(isMeaningfulGrammarAudio({
      durationSeconds: 240,
      playedSeconds: 239,
      completed: false,
    })).toBe(false)

    expect(isMeaningfulGrammarAudio({
      durationSeconds: 240,
      playedSeconds: 240,
      completed: true,
    })).toBe(true)
  })

  it('requires long grammar audio to reach 60 percent and at least 5 listened minutes', () => {
    expect(isMeaningfulGrammarAudio({
      durationSeconds: 1_800,
      playedSeconds: 45,
      completed: false,
    })).toBe(false)

    expect(isMeaningfulGrammarAudio({
      durationSeconds: 600,
      playedSeconds: 299,
      completed: false,
    })).toBe(false)

    expect(isMeaningfulGrammarAudio({
      durationSeconds: 600,
      playedSeconds: 360,
      completed: false,
    })).toBe(true)
  })

  it('treats grammar text exposure as grammar readiness', () => {
    expect(isMeaningfulTextExposure({ visibleSeconds: 119, meaningfulScroll: false })).toBe(false)
    expect(isMeaningfulTextExposure({ visibleSeconds: 120, meaningfulScroll: false })).toBe(true)
    expect(isMeaningfulTextExposure({ visibleSeconds: 10, meaningfulScroll: true })).toBe(true)

    expect(decideLessonReadiness({
      hasDialogue: true,
      grammarText: { visibleSeconds: 120, meaningfulScroll: false },
    }).grammarReady).toBe(true)
  })

  it('requires short dialogue audio to be completed once', () => {
    expect(isMeaningfulDialogueAudio({
      durationSeconds: 45,
      playedSeconds: 44,
      completed: false,
    })).toBe(false)

    expect(isMeaningfulDialogueAudio({
      durationSeconds: 45,
      playedSeconds: 45,
      completed: true,
    })).toBe(true)
  })

  it('uses 60 percent playback for longer dialogue audio without a 5-minute floor', () => {
    expect(isMeaningfulDialogueAudio({
      durationSeconds: 120,
      playedSeconds: 71,
      completed: false,
    })).toBe(false)

    expect(isMeaningfulDialogueAudio({
      durationSeconds: 120,
      playedSeconds: 72,
      completed: false,
    })).toBe(true)
  })

  it('satisfies words and sentences through dialogue text exposure', () => {
    expect(decideLessonReadiness({
      hasDialogue: true,
      dialogueText: { visibleSeconds: 120, meaningfulScroll: false },
    })).toEqual({
      grammarReady: false,
      wordsAndSentencesReady: true,
      meaningfulExposure: true,
    })
  })

  it('uses grammar exposure for words and sentences only when dialogue is absent', () => {
    expect(decideLessonReadiness({
      hasDialogue: true,
      grammarText: { visibleSeconds: 120, meaningfulScroll: false },
    }).wordsAndSentencesReady).toBe(false)

    expect(decideLessonReadiness({
      hasDialogue: false,
      grammarText: { visibleSeconds: 120, meaningfulScroll: false },
    })).toEqual({
      grammarReady: true,
      wordsAndSentencesReady: true,
      meaningfulExposure: true,
    })
  })

  it('does not let culture or pronunciation concepts gate readiness', () => {
    expect(decideLessonReadiness({ hasDialogue: true })).toEqual({
      grammarReady: false,
      wordsAndSentencesReady: false,
      meaningfulExposure: false,
    })
  })
})
