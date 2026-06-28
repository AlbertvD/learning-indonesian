/**
 * Minimal runtime Indonesian affix-stripper for the Lezen reader's gloss fallback.
 *
 * The project's real morphology engine (`scripts/lib/affix.ts`, `src/lib/morphology/`)
 * is build-time / catalog-oriented and does not expose a "surface form → candidate
 * roots" runtime function. The reader only needs this to recover a root GLOSS when a
 * tapped affixed form (e.g. `membaca`) is not itself a `learning_item` but its root
 * (`baca`) is. So this deliberately OVER-generates candidates: a wrong candidate is
 * harmless because the gloss resolver only uses one that matches a real learning_item.
 *
 * Pure, no I/O. Returns the original plus stripped candidates, longest-affix first is
 * not required — the resolver tries all and takes the first item match.
 */

const PREFIXES = ['memper', 'menye', 'menge', 'meng', 'meny', 'mem', 'men', 'me',
  'member', 'ber', 'be', 'ter', 'te', 'peng', 'peny', 'pem', 'pen', 'per', 'pe',
  'di', 'ke', 'se']

const SUFFIXES = ['kannya', 'annya', 'inya', 'kan', 'an', 'i', 'nya', 'ku', 'mu',
  'lah', 'kah', 'pun']

// meN-/peN- nasalisation elides the root's initial consonant; restore the likely one.
// e.g. mem-baca→baca but mem-pukul→pukul; men-ulis→tulis; meng-ambil→ambil/kambil.
const NASAL_RESTORE: Record<string, string[]> = {
  mem: ['', 'p', 'b'],
  men: ['', 't', 'd'],
  meny: ['s'],
  meng: ['', 'k', 'g'],
  menge: [''],
  pem: ['', 'p', 'b'],
  pen: ['', 't', 'd'],
  peny: ['s'],
  peng: ['', 'k', 'g'],
}

function stripSuffixes(word: string): string[] {
  const out = new Set<string>([word])
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 2) {
      out.add(word.slice(0, word.length - suf.length))
    }
  }
  return [...out]
}

/**
 * Candidate base forms for a surface word, including itself. Generous by design.
 */
export function affixCandidates(word: string): string[] {
  const w = word.toLowerCase().trim()
  if (w.length < 3) return [w]
  const candidates = new Set<string>([w])

  // suffix-only
  for (const base of stripSuffixes(w)) candidates.add(base)

  // prefix (then suffix-strip the remainder too)
  for (const pre of PREFIXES) {
    if (!w.startsWith(pre) || w.length - pre.length < 2) continue
    const rest = w.slice(pre.length)
    const restoreInitials = NASAL_RESTORE[pre] ?? ['']
    for (const initial of restoreInitials) {
      const root = initial + rest
      for (const base of stripSuffixes(root)) candidates.add(base)
    }
  }

  // reduplication: oleh-oleh → oleh; berlari-lari → berlari/lari
  if (w.includes('-')) {
    const [head] = w.split('-')
    if (head && head.length >= 2) {
      candidates.add(head)
      for (const pre of PREFIXES) {
        if (head.startsWith(pre) && head.length - pre.length >= 2) {
          candidates.add(head.slice(pre.length))
        }
      }
    }
  }

  return [...candidates].filter((c) => c.length >= 2)
}
