/**
 * Text similarity utilities for ASR quality gate.
 *
 * Exported for use in asr-quality-gate.ts and unit tests.
 */

// Words that, if missing or added, constitute a meaning change in Indonesian
const MEANING_CRITICAL_WORDS = new Set([
  'tidak', 'bukan', 'belum', 'jangan',  // negation
  'sudah', 'akan', 'sedang',            // tense markers
  'sangat', 'sekali', 'paling',         // intensifiers
  'dan', 'atau', 'tetapi',             // conjunctions
  'di', 'ke', 'dari',                  // critical prepositions
  'saya', 'kamu', 'dia', 'kami', 'mereka', 'kita', // pronouns
])

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\-\u2013\u2014]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array(n + 1)
  let curr = new Array(n + 1)

  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]
}

/**
 * Compute normalized similarity score (0..1) between original and transcribed text.
 * 1.0 = identical, 0.0 = completely different.
 */
export function similarityScore(original: string, transcribed: string): number {
  const normOrig = normalizeText(original)
  const normTrans = normalizeText(transcribed)

  if (normOrig === normTrans) return 1.0
  if (normOrig.length === 0 && normTrans.length === 0) return 1.0
  if (normOrig.length === 0 || normTrans.length === 0) return 0.0

  const distance = levenshteinDistance(normOrig, normTrans)
  const maxLen = Math.max(normOrig.length, normTrans.length)

  return Math.max(0, 1 - distance / maxLen)
}

/**
 * Detect if a transcription error changes the meaning of the text.
 * Checks for missing or spuriously added meaning-critical words.
 */
export function detectMeaningChange(
  original: string,
  transcribed: string,
): { changed: boolean; details: string } {
  const origWords = new Set(normalizeText(original).split(' '))
  const transWords = new Set(normalizeText(transcribed).split(' '))

  const missingCritical: string[] = []
  const addedCritical: string[] = []

  for (const word of MEANING_CRITICAL_WORDS) {
    const inOrig = origWords.has(word)
    const inTrans = transWords.has(word)

    if (inOrig && !inTrans) {
      missingCritical.push(word)
    } else if (!inOrig && inTrans) {
      addedCritical.push(word)
    }
  }

  if (missingCritical.length === 0 && addedCritical.length === 0) {
    return { changed: false, details: '' }
  }

  const parts: string[] = []
  if (missingCritical.length > 0) {
    parts.push(`missing: [${missingCritical.join(', ')}]`)
  }
  if (addedCritical.length > 0) {
    parts.push(`added: [${addedCritical.join(', ')}]`)
  }

  return { changed: true, details: `Meaning-critical words ${parts.join('; ')}` }
}
