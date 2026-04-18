/**
 * Indonesian morphological affix stripping for vocab-coverage checks.
 *
 * Single source of truth — both check-vocab-coverage.ts and lint-staging.ts
 * import from here. Don't duplicate.
 *
 * Indonesian morphology is complex; we handle only the productive affixes
 * that appear in beginner content. Known limitations are documented in the
 * test file.
 */

// Suffixes are clitics and verbal endings.
// We deliberately omit '-i' (the locative/causative suffix). It cannot be
// distinguished from a root-final 'i' without a dictionary lookup, so any
// rule we pick either over-strips basic nouns (kopi, pagi, hari, tinggi) or
// fails to strip real verbal -i derivations. The cost of leaving it out:
// some false-positive unknowns for forms like mempelajari (root pelajar) and
// mengetahui (root tahu). Acceptable.
export const SUFFIXES = ['nya', 'lah', 'kah', 'ku', 'mu', 'kan'] as const

// Prefixes restricted to forms that DON'T morph the root's first letter.
// Deliberately excluded:
// - bare 'me' and 'pe' (would strip from merah, pelan, mejaku, pekan)
// - 'ku' and 'mu' (clitics; only valid as suffixes — kucing, mungkin etc.)
// - 'memb'/'memf'/'memp' and other 4-char meN- variants (would lose the root's
//   first letter — memberi → eri, mempunyai → unyai)
// - 'menj'/'menc'/'mens'/'pemb'/'penj'/'pens'/'penc' (same — menjual → ual)
//
// Net effect: known meN-/peN- verb forms whose root starts with a non-morphed
// letter strip the prefix cleanly (mengambil → ambil). Forms whose root letter
// IS morphed away (mempunyai) don't fully reduce — we strip 'mem' giving
// 'punyai' (vs canonical 'punya'). Verbal -i derivations (mempelajari) reduce
// only to 'pelajari' (vs canonical 'pelajar') because '-i' is not in SUFFIXES.
// Both are accepted false-positives — see test file for the full set.
export const PREFIXES = [
  'meng', 'meny', 'peng', 'peny',
  'mem', 'men', 'pem', 'pen',
  'ber', 'ter', 'per',
  'di', 'se', 'ke',
] as const

// Strip prefixes first, then suffixes. Prefix-first is important for words
// like 'mencari' (root: cari) where suffix-first would over-strip a root-final
// letter that incidentally matches a suffix pattern.
export function stripAffixes(word: string): string {
  let w = word
  let changed = true
  while (changed) {
    changed = false
    for (const pre of PREFIXES) {
      if (w.length > pre.length + 2 && w.startsWith(pre)) {
        w = w.slice(pre.length)
        changed = true
        break
      }
    }
    for (const suf of SUFFIXES) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) {
        w = w.slice(0, -suf.length)
        changed = true
        break
      }
    }
  }
  return w
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
}

// Indonesian function words / particles / pronouns / discourse markers that
// are pedagogically transparent and never warrant flagging in vocab coverage.
export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'itu','ini','di','ke','dari','yang','dan','atau','tapi','tetapi','dengan','untuk','pada','dalam','akan','sudah','belum','tidak','bukan','adalah','ada','saya','kamu','dia','kami','kita','mereka','anda','aku','ya','juga','saja','lagi','sangat','sekali','agar','supaya','karena','sebab','jika','kalau','maka','kemudian','lalu','setelah','sebelum','ketika','waktu','sambil','tanpa','tentang','seperti','sang','bahwa','bagi','oleh','sampai','hingga','baru','lebih','paling','suka','bisa','dapat','harus','mau','ingin','perlu','boleh','sedang','sini','sana','situ','kenapa','apa','siapa','mana','bagaimana','kapan','berapa','lah','kah','pun','nya','sebuah','seorang','para','semua','setiap','beberapa','banyak','sedikit',
])
