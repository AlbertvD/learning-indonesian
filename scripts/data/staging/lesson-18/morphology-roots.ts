// Lesson 18 (Bab 2) — di- passive application tier: the LEAN judgment-only
// authoring input (Spec 2, docs/plans/2026-06-18-morphology-authoring-capability.md §3.2).
//
// di- is the invariant passive prefix (no allomorphy): di- + root. Roots are
// common transitive verbs from prior lessons (already live learning_items), each
// filed under L18's core passive category. The engine fills derived/rule; the
// generation script mints the pattern slug.

import type { MorphologyRoot } from '@/lib/capabilities'

const DI = 'Passieve zin met de DI-vorm (3e persoon, agens onbenoemd)'

export const morphologyRoots: MorphologyRoot[] = [
  { root: 'baca', affix: 'di-', illustratesCategory: DI }, // dibaca
  { root: 'tulis', affix: 'di-', illustratesCategory: DI }, // ditulis
  { root: 'beli', affix: 'di-', illustratesCategory: DI }, // dibeli
  { root: 'jual', affix: 'di-', illustratesCategory: DI }, // dijual
  { root: 'cari', affix: 'di-', illustratesCategory: DI }, // dicari
  { root: 'ambil', affix: 'di-', illustratesCategory: DI }, // diambil
  { root: 'kirim', affix: 'di-', illustratesCategory: DI }, // dikirim
  { root: 'buka', affix: 'di-', illustratesCategory: DI }, // dibuka
  { root: 'tutup', affix: 'di-', illustratesCategory: DI }, // ditutup
  { root: 'bawa', affix: 'di-', illustratesCategory: DI }, // dibawa
]
