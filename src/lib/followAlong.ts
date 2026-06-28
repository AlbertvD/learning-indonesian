import type { TranscriptSegment } from '@/services/podcastService'

/** Location of the active word within the segmented transcript. */
export interface ActiveWord {
  segmentIdx: number
  wordIdx: number
}

/**
 * The word being spoken (or just spoken) at `currentTime` — the last word whose
 * `start <= currentTime`. Returns null before the first word starts. Keeping the
 * prior word active through inter-word / inter-sentence pauses stops the
 * highlight flickering dark during the 800ms breaks. Segments without `words`
 * (un-timed episodes) contribute nothing. Relies on starts being monotonic
 * across the episode (guaranteed by the aligner), so it can stop at the first
 * word that starts after `currentTime`.
 */
export function findActiveWord(segments: TranscriptSegment[], currentTime: number): ActiveWord | null {
  let active: ActiveWord | null = null
  for (let s = 0; s < segments.length; s++) {
    const words = segments[s].words
    if (!words) continue
    for (let w = 0; w < words.length; w++) {
      if (words[w].start <= currentTime) active = { segmentIdx: s, wordIdx: w }
      else return active
    }
  }
  return active
}
