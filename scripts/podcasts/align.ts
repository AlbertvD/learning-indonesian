// Story-podcast word-timing alignment.
//
// Recovers per-word audio timings for follow-along highlighting (ADR 0022
// amendment 2026-06-28). The TTS engine (Chirp3-HD) returns no timepoints, so
// timings come from Google STT word-offsets run over the synthesised audio; this
// pure function aligns the recognised word stream onto the KNOWN authored script.
//
// Ground truth is the script: the output keeps the authored spelling/case/
// punctuation of every word and only borrows timing from the matched STT word.
// Recognition of clean TTS audio is near-1:1, so a plain zip would *almost* work
// — but a single dropped/merged token would shift every later word. A global
// (Needleman–Wunsch) alignment stays correct at those seams; words STT dropped
// are interpolated into the gap between their timed neighbours.

import type { TranscriptSegment, TimedWord } from '@/services/textService'

/** A recognised word with its audio timing (seconds), in audio order. */
export interface SttWord {
  word: string
  start: number
  end: number
}

/** Lowercase + strip punctuation so authored spelling matches STT's bare tokens. */
function normalize(word: string): string {
  return word.toLowerCase().replace(/[.,!?;:'"()\-–—]/g, '')
}

/**
 * Global sequence alignment (Needleman–Wunsch) over two normalized token lists.
 * Returns ordered pairs `[scriptIdx, sttIdx]`; `-1` on a side means a gap
 * (script word STT dropped, or STT word not in the script).
 */
function alignSequences(script: string[], stt: string[]): Array<[number, number]> {
  const n = script.length
  const m = stt.length
  const GAP = -1
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) dp[i][0] = i * GAP
  for (let j = 0; j <= m; j++) dp[0][j] = j * GAP
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = dp[i - 1][j - 1] + (script[i - 1] === stt[j - 1] ? 1 : -1)
      dp[i][j] = Math.max(diag, dp[i - 1][j] + GAP, dp[i][j - 1] + GAP)
    }
  }

  const pairs: Array<[number, number]> = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (script[i - 1] === stt[j - 1] ? 1 : -1)) {
      pairs.push([i - 1, j - 1]); i--; j--
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP) {
      pairs.push([i - 1, -1]); i-- // script word with no STT match (dropped)
    } else {
      pairs.push([-1, j - 1]); j-- // STT word not in the script (insertion) — ignored
    }
  }
  pairs.reverse()
  return pairs
}

/**
 * Fill timings for unmatched (null) script words by spreading the gap between
 * their nearest timed neighbours evenly. Mutates `times` in place.
 */
function interpolateGaps(times: Array<{ start: number; end: number } | null>): void {
  let r = 0
  while (r < times.length) {
    if (times[r] !== null) { r++; continue }
    let end = r
    while (end < times.length && times[end] === null) end++
    const runLen = end - r
    const prevEnd = r > 0 ? times[r - 1]!.end : 0
    const nextStart = end < times.length ? times[end]!.start : prevEnd
    const step = (nextStart - prevEnd) / runLen
    for (let k = 0; k < runLen; k++) {
      times[r + k] = { start: prevEnd + step * k, end: prevEnd + step * (k + 1) }
    }
    r = end
  }
}

/**
 * Pre-write guard (data-architect condition): every timed segment must carry at
 * least one word, every word must have `end > start`, and starts must be
 * monotonic non-decreasing across the whole episode. Throws on the first
 * violation. Segments without `words` (un-timed episodes) are skipped — valid.
 * This is the cheapest mechanism for the timing invariant: a write-time assertion
 * at the alignment seam, not a DB constraint or health check.
 */
export function assertValidTimings(segments: TranscriptSegment[]): void {
  let lastStart = -Infinity
  for (const segment of segments) {
    if (!segment.words) continue
    if (segment.words.length === 0) {
      throw new Error(`segment ${segment.idx} has an empty words array (no words)`)
    }
    for (const w of segment.words) {
      if (w.end <= w.start) {
        throw new Error(`word "${w.word}" (segment ${segment.idx}) has end <= start (${w.start} → ${w.end})`)
      }
      if (w.start < lastStart) {
        throw new Error(`word "${w.word}" (segment ${segment.idx}) start ${w.start} is not monotonic (< ${lastStart})`)
      }
      lastStart = w.start
    }
  }
}

/**
 * Recover from STT tail-drops: when STT drops a run of words and lumps that audio
 * into one over-long neighbour, alignment leaves several words bunched at one
 * instant (a "skip") followed by a word that holds for seconds (a "hover"). Where
 * such a bunched cluster has a long enough total span to work with, redistribute
 * its words evenly across that span. Mutates `times` in place. Only fires on a
 * genuine bunch (≥3 words within `CLUSTER_GAP`) with room to spread, so normal
 * fast speech is untouched.
 */
const CLUSTER_GAP = 0.12
const MIN_STEP = 0.12
function spreadCollapsedClusters(times: Array<{ start: number; end: number }>): void {
  let i = 0
  while (i < times.length) {
    let j = i
    while (j + 1 < times.length && times[j + 1].start - times[j].start < CLUSTER_GAP) j++
    const runLen = j - i + 1
    const span = times[j].end - times[i].start
    if (runLen >= 3 && span > runLen * MIN_STEP) {
      const start = times[i].start
      const step = span / runLen
      for (let k = 0; k < runLen; k++) {
        times[i + k] = { start: start + step * k, end: start + step * (k + 1) }
      }
    }
    i = j + 1
  }
}

/**
 * Align the recognised STT word stream to the script and return each segment
 * enriched with per-(script-)word timings.
 */
export function alignWordTimings(segments: TranscriptSegment[], sttWords: SttWord[]): TranscriptSegment[] {
  // Flatten script words across segments, tracking which segment each belongs to.
  const flat: { word: string; segment: number }[] = []
  segments.forEach((segment, s) => {
    for (const word of segment.id.split(/\s+/).filter(Boolean)) flat.push({ word, segment: s })
  })

  const pairs = alignSequences(flat.map((f) => normalize(f.word)), sttWords.map((w) => normalize(w.word)))

  // One timing slot per script word; a matched diagonal (even a mishearing)
  // borrows that STT slot's timing, true drops stay null for interpolation.
  const times: Array<{ start: number; end: number } | null> = new Array(flat.length).fill(null)
  for (const [s, t] of pairs) {
    if (s >= 0 && t >= 0) times[s] = { start: sttWords[t].start, end: sttWords[t].end }
  }
  interpolateGaps(times)

  // STT can return endTime == startTime for a clipped token, and an empty
  // interpolation gap collapses to zero too. Guarantee a positive highlight
  // duration so the timings are valid and a word never flashes for 0ms.
  const MIN_DURATION = 0.05
  for (const t of times) {
    if (t && t.end <= t.start) t.end = t.start + MIN_DURATION
  }

  // Recover STT tail-drops (bunched cluster + over-long absorbing word).
  spreadCollapsedClusters(times as Array<{ start: number; end: number }>)

  // Regroup timed words back into their segments, keeping authored spelling.
  return segments.map((segment, s) => {
    const words: TimedWord[] = flat
      .map((f, idx) => ({ f, idx }))
      .filter(({ f }) => f.segment === s)
      .map(({ f, idx }) => ({ word: f.word, start: times[idx]!.start, end: times[idx]!.end }))
    return { ...segment, words }
  })
}
