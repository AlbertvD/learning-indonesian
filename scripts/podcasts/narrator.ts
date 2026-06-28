// Story-podcast narrator — Chirp3-HD arm.
//
// Renders an aligned segment list to a single narrated MP3, word-for-word the
// Indonesian transcript (read-along fidelity, ADR 0022). Pacing is level-graded
// (pacing.ts) and reaches the audio through SSML — Google Cloud TTS only honours
// prosody/break when sent via `input:{ssml}`, so synthesis uses the SSML-capable
// path (synthesizeSsml), NOT the plain-text `synthesizeSpeech`.
//
// This is the Chirp3-HD (Google Cloud TTS) bake-off arm. The Gemini 2.5 TTS arm
// + the engine adapter land in slice 3 (#295).

import type { TranscriptSegment } from '@/services/textService'
import { buildSSML, type SpeakableLine } from '../lib/ssml-builder'
import { synthesizeSsml } from '../lib/tts-client'
import { levelToPacing, type Level } from './pacing'

// A warm Chirp3-HD storyteller voice (female). Override via PODCAST_VOICE.
export const DEFAULT_STORY_VOICE = 'id-ID-Chirp3-HD-Despina'

// Google Cloud TTS caps a single synthesis request at 5000 bytes of input.
const TTS_INPUT_BYTE_LIMIT = 5000

/**
 * Build the level-graded SSML document narrating a story's Indonesian sentences.
 * Pure — reuses the shared `buildSSML` via the CEFR→(variant, speed) adapter
 * without editing the shared builder's pause model.
 */
export function buildNarrationSsml(segments: TranscriptSegment[], level: Level): string {
  const { variant, speed } = levelToPacing(level)
  const lines: SpeakableLine[] = segments.map((s) => ({ text: s.id, language: 'id' }))
  return buildSSML(lines, variant, speed)
}

/**
 * Synthesise the whole episode to one MP3 (Chirp3-HD). Slice 1 issues a single
 * request; if the SSML exceeds Google's 5000-byte input cap it throws a clear
 * error (chunk-and-concat is a later slice, not silent truncation).
 */
export async function synthesizeEpisode(
  segments: TranscriptSegment[],
  level: Level,
  voiceId: string = process.env.PODCAST_VOICE ?? DEFAULT_STORY_VOICE,
): Promise<Buffer> {
  const ssml = buildNarrationSsml(segments, level)
  const bytes = Buffer.byteLength(ssml, 'utf8')
  if (bytes > TTS_INPUT_BYTE_LIMIT) {
    throw new Error(
      `narration SSML is ${bytes} bytes, over Google TTS's ${TTS_INPUT_BYTE_LIMIT}-byte cap — shorten the story or add chunking (later slice)`,
    )
  }
  return synthesizeSsml(ssml, voiceId)
}
