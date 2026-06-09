/**
 * cleanItemText — strip orthographic parentheticals from a vocabulary /
 * expression / number headword so they do not propagate into the learner
 * experience.
 *
 * The textbook annotates some words with a bracketed pronunciation gloss
 * ("cek (cèk)"), an abbreviation ("rupiah (Rp)"), a dialect note
 * ("nggak (Jakarta)"), or an optional letter/word ("k(e)ran",
 * "tidak (ada) apa-apa"). Stored verbatim, that bracket leaks everywhere: the
 * TTS reads it aloud ("cek, cèk") and it becomes part of the MCQ answer. Modern
 * Indonesian neural TTS (Chirp3-HD) pronounces the clean spelling correctly —
 * the gloss was always a human reading aid, never a TTS input — so we drop it.
 *
 * Two cases (decided 2026-06; "keep the occasional word" for the inline case):
 *   - Trailing gloss — "cek (cèk)", "rupiah (Rp)", "nggak (Jakarta)",
 *     "deh! (deh)" → drop it entirely → "cek", "rupiah", "nggak", "deh!".
 *   - Inline parens marking an optional letter/word — "k(e)ran",
 *     "tidak (ada) apa-apa" → keep the content, drop only the brackets →
 *     "keran", "tidak ada apa-apa".
 *
 * Applied ONLY to vocabulary/expression/number item headwords at projection.
 * Exercise sentences (whose parens are meaningful instructions, e.g.
 * "Pilih yang benar: … (nadruk op geel)") do NOT flow through here.
 */
export function cleanItemText(text: string): string {
  const cleaned = text
    .replace(/\s*\([^)]*\)\s*$/u, '') // 1. trailing parenthetical gloss → drop whole
    .replace(/[()]/gu, '') //            2. inline parens → keep content, drop brackets only
    .replace(/\s+/gu, ' ')
    .trim()
  // Never blank out a real item if it was somehow all-parenthetical.
  return cleaned.length > 0 ? cleaned : text.trim()
}
