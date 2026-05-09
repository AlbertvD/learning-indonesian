import type { ValidationFinding } from '../model'

interface LessonLike {
  primary_voice: string | null | undefined
  dialogue_voices: Record<string, string> | null | undefined
}

interface SectionLike {
  content: Record<string, unknown>
}

/**
 * GT4 — If the lesson contains any dialogue sections, the lesson row MUST
 * have `primary_voice` set AND `dialogue_voices` configured as a non-empty
 * `{speaker: voice_id}` map covering every speaker that appears in any
 * dialogue line. Without it, runtime audio resolution silently breaks.
 *
 * NOTE: staging files don't currently author voice config — it's computed at
 * publish time by `setLessonVoicesForLesson` (per spec §13 risk #7). When
 * staging carries neither field (both `undefined`), we skip the check: the
 * audio orchestrator populates them before TTS runs. The validator only
 * fires when staging EXPLICITLY provides voices, so it can catch broken or
 * partial configurations.
 */
export function validateLessonVoices(
  lesson: LessonLike,
  sections: SectionLike[],
): ValidationFinding[] {
  if (lesson.primary_voice === undefined && lesson.dialogue_voices === undefined) {
    return []
  }

  const speakers = new Set<string>()
  for (const section of sections) {
    if (section.content?.type !== 'dialogue') continue
    const lines = section.content.lines
    if (!Array.isArray(lines)) continue
    for (const line of lines as Array<{ speaker?: unknown }>) {
      if (typeof line.speaker === 'string' && line.speaker.trim().length > 0) {
        speakers.add(line.speaker.trim())
      }
    }
  }

  if (speakers.size === 0) return []

  const findings: ValidationFinding[] = []

  if (typeof lesson.primary_voice !== 'string' || lesson.primary_voice.trim().length === 0) {
    findings.push({
      gate: 'GT4',
      severity: 'error',
      message: 'Lesson contains dialogue sections but primary_voice is not set',
    })
  }

  const voices = lesson.dialogue_voices
  if (!voices || typeof voices !== 'object' || Object.keys(voices).length === 0) {
    findings.push({
      gate: 'GT4',
      severity: 'error',
      message: 'Lesson contains dialogue sections but dialogue_voices is not set',
    })
    return findings
  }

  const missing: string[] = []
  for (const speaker of speakers) {
    const voice = voices[speaker]
    if (typeof voice !== 'string' || voice.trim().length === 0) {
      missing.push(speaker)
    }
  }
  if (missing.length > 0) {
    findings.push({
      gate: 'GT4',
      severity: 'error',
      message: `dialogue_voices is missing entries for speaker(s): ${missing.join(', ')}`,
    })
  }

  return findings
}
