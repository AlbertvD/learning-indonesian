// Lesson 20 (Bab 4) — peN- application tier: the LEAN judgment-only authoring
// input (Spec 2, docs/plans/2026-06-18-morphology-authoring-capability.md §3.2).
//
// peN- forms an agent/instrument noun. Roots are drawn from PRIOR lessons (they
// must already be live learning_items — L20's own vocab is spices/taste words and
// carries no peN- verb roots), and each is filed under the L20 grammar category
// that demonstrates its nasalisation class. The deterministic engine fills the
// derived form, class, and rule; the generation script mints the pattern slug.

import type { MorphologyRoot } from '@/lib/capabilities'

const A = 'A. Voorvoeging zonder verandering van het basiswoord (L, M, N, NY, R, W, Y)'
const PEM = 'PEM- voor B en F'
const PEN = 'PEN- voor C, D, J'
const PENG = 'PENG- voor de klinkers (A, E, I, O, U) en voor G, H'
const B = 'B. Voorvoeging met wegval van de beginklank (K, P, S, T)'

export const morphologyRoots: MorphologyRoot[] = [
  // A — pe- (no sound change): l/m/n/ny/r/w/y roots
  { root: 'masak', affix: 'peN-', illustratesCategory: A }, // m → pe: pemasak

  // PEM- — b/f roots (no elision)
  { root: 'baca', affix: 'peN-', illustratesCategory: PEM }, // b → pem: pembaca
  { root: 'beli', affix: 'peN-', illustratesCategory: PEM }, // b → pem: pembeli

  // PEN- — c/d/j roots (no elision)
  { root: 'cari', affix: 'peN-', illustratesCategory: PEN }, // c → pen: pencari
  { root: 'dengar', affix: 'peN-', illustratesCategory: PEN }, // d → pen: pendengar
  { root: 'jual', affix: 'peN-', illustratesCategory: PEN }, // j → pen: penjual

  // PENG- — vowel/g/h roots (no elision)
  { root: 'ambil', affix: 'peN-', illustratesCategory: PENG }, // a → peng: pengambil
  { root: 'ganti', affix: 'peN-', illustratesCategory: PENG }, // g → peng: pengganti

  // B — K/P/S/T: initial consonant elides
  { root: 'tulis', affix: 'peN-', illustratesCategory: B }, // t drop → pen: penulis
  { root: 'kirim', affix: 'peN-', illustratesCategory: B }, // k drop → peng: pengirim
  { root: 'pukul', affix: 'peN-', illustratesCategory: B }, // p drop → pem: pemukul
]
