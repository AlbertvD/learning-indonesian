// Lesson 13 — meN- application tier: the LEAN judgment-only authoring input
// (Spec 2, docs/plans/2026-06-18-morphology-authoring-capability.md §3.2).
//
// A human/agent authors ONLY (root, affix, illustratesCategory) here; the
// deterministic engine + scripts/generate-morphology-patterns.ts fill the
// rule-governed fields and emit the committed morphology-patterns.ts. Every root
// must already exist as a learning_item; illustratesCategory is the EXACT title of
// a grammar category in this lesson's lesson.ts content.categories.

import type { MorphologyRoot } from '@/lib/capabilities'

const A1 = 'A1. ME- zonder verandering (me-)'
const A2 = 'A2. ME- met aangepast voorvoegsel (mem-, men-, meng-)'
const B = 'B. ME- met verandering van de eerste klank (K, P, S, T)'

export const morphologyRoots: MorphologyRoot[] = [
  // A1 — me- (no sound change): l/m/n/r/w/y roots
  { root: 'masak', affix: 'meN-', illustratesCategory: A1 },
  { root: 'lihat', affix: 'meN-', illustratesCategory: A1 },

  // A2 — mem-/men-/meng- (adjusted prefix, no elision)
  { root: 'baca', affix: 'meN-', illustratesCategory: A2 },
  { root: 'beli', affix: 'meN-', illustratesCategory: A2 },
  { root: 'cari', affix: 'meN-', illustratesCategory: A2 },
  { root: 'dengar', affix: 'meN-', illustratesCategory: A2 },
  { root: 'jual', affix: 'meN-', illustratesCategory: A2 },
  { root: 'ganti', affix: 'meN-', illustratesCategory: A2 },
  { root: 'ambil', affix: 'meN-', illustratesCategory: A2 },

  // B — K/P/S/T: the initial consonant elides
  { root: 'tulis', affix: 'meN-', illustratesCategory: B },
  { root: 'tukar', affix: 'meN-', illustratesCategory: B },
  { root: 'pukul', affix: 'meN-', illustratesCategory: B },
  { root: 'potong', affix: 'meN-', illustratesCategory: B },
  { root: 'kirim', affix: 'meN-', illustratesCategory: B },
]
