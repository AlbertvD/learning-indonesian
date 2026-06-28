// Story-podcast episode assembly.
//
// Builds the `PodcastData` seed record from an authored+translated+narrated
// episode: carries the aligned `transcript_segments` and DENORMALIZES the
// per-language full-text columns as the joined segments. The denormalization is
// the data-architect's consistency invariant (a live-DB health check asserts
// transcript_indonesian == the joined segment ids), so the join delimiter is a
// single shared constant used by both this writer and that check.

import type { TranscriptSegment, PodcastAttribution } from '@/services/podcastService'
import type { PodcastData } from '../data/podcasts'
import type { Level } from './pacing'
import { alignWordTimings, assertValidTimings, type SttWord } from './align'

/** Delimiter joining segments into the denormalized full-text columns. */
export const SEGMENT_JOIN = '\n\n'

export function joinSegments(segments: TranscriptSegment[], lang: 'id' | 'nl' | 'en'): string {
  return segments.map((s) => s[lang]).join(SEGMENT_JOIN)
}

export interface AssembleInput {
  title: string
  description: string | null
  level: Level
  segments: TranscriptSegment[]
  audio_filename: string
  duration_seconds: number
  /** CC attribution for a sourced episode; null/omitted for LLM-original. */
  attribution?: PodcastAttribution | null
}

/**
 * The denormalization invariant, as a pure predicate the live-DB health check
 * reuses: for a row carrying segments, each full-text column must equal the
 * joined segments. Returns null if consistent (or nothing to check), else a
 * message naming the diverging language. Same delimiter as `assembleEpisode`,
 * so writer and check can never drift apart.
 */
export function transcriptDrift(row: {
  transcript_segments: TranscriptSegment[] | null
  transcript_indonesian: string | null
  transcript_dutch: string | null
  transcript_english: string | null
}): string | null {
  const segs = row.transcript_segments
  if (!segs || segs.length === 0) return null
  const mismatches: string[] = []
  if (row.transcript_indonesian !== joinSegments(segs, 'id')) mismatches.push('indonesian')
  if (row.transcript_dutch !== joinSegments(segs, 'nl')) mismatches.push('dutch')
  if (row.transcript_english !== joinSegments(segs, 'en')) mismatches.push('english')
  return mismatches.length ? `transcript_${mismatches.join('/')} diverges from transcript_segments` : null
}

/**
 * Re-time an already-generated episode: align its existing segments to a fresh
 * STT word stream (run over the episode's existing audio), enrich each segment
 * with per-word timings, and rebuild the record. Pure — no I/O, no re-synthesis;
 * the `--retime` flow on `run.ts` supplies the STT words. The denormalized
 * `transcript_*` columns are unchanged (timings don't alter sentence text), so
 * the HC36 invariant still holds. Throws if there are no segments to time.
 */
export function retimeRecord(record: PodcastData, sttWords: SttWord[]): PodcastData {
  if (!record.transcript_segments || record.transcript_segments.length === 0) {
    throw new Error('cannot re-time: record has no transcript_segments')
  }
  const timed = alignWordTimings(record.transcript_segments, sttWords)
  assertValidTimings(timed)
  return assembleEpisode({
    title: record.title,
    description: record.description,
    level: record.level as Level,
    segments: timed,
    audio_filename: record.audio_filename,
    duration_seconds: record.duration_seconds,
    attribution: record.attribution ?? null,
  })
}

export function assembleEpisode(input: AssembleInput): PodcastData {
  const { title, description, level, segments, audio_filename, duration_seconds, attribution } = input
  return {
    title,
    description,
    level,
    duration_seconds,
    audio_filename,
    transcript_indonesian: joinSegments(segments, 'id'),
    transcript_dutch: joinSegments(segments, 'nl'),
    transcript_english: joinSegments(segments, 'en'),
    transcript_segments: segments,
    attribution: attribution ?? null,
  }
}
