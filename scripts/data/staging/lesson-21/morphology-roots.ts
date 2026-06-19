// Lesson 21 (Bab 5, Dongeng) — -KAN application tier: the LEAN judgment-only
// authoring input (ADR 0019; docs/plans/2026-06-18-morphology-generalized-derivation-and-context.md).
//
// L21 teaches -kan almost always as a WRAP-AROUND: active me-…-kan and passive
// di-…-kan. A human/agent authors ONLY (root, affix, illustratesCategory); the
// deterministic engine + scripts/generate-morphology-patterns.ts fill the
// rule-governed fields (incl. circumfix pieces) and harvest the carrier sentence.
// Every root already exists as a learning_item; illustratesCategory is the EXACT
// title of a grammar category in this lesson's lesson.ts content.categories.
//
// Distribution (ADR 0019 Q9): a pair links to the FORMATION rule it instantiates,
// not the semantic-reading category — me-…-kan → the main -KAN formation pattern;
// di-…-kan → the active/passive pairing pattern.

import type { MorphologyRoot } from '@/lib/capabilities'

const ACTIVE = 'De werkwoordsvorm met -KAN — hoofdfunctie'
const PASSIVE = 'ME-...-KAN naast DI-...-KAN'

export const morphologyRoots: MorphologyRoot[] = [
  // ── Active me-…-kan (nasalising left half) ─────────────────────────────────
  { root: 'beli', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // membelikan
  { root: 'naik', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // menaikkan
  { root: 'turun', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // menurunkan (t elides)
  { root: 'bersih', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // membersihkan
  { root: 'kering', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // mengeringkan (k elides)
  { root: 'tempat', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // menempatkan (t elides)
  { root: 'duduk', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // mendudukkan
  { root: 'ambil', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // mengambilkan (vowel)
  { root: 'jatuh', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // menjatuhkan
  { root: 'guna', affix: 'meN-…-kan', illustratesCategory: ACTIVE }, // menggunakan

  // ── Passive di-…-kan (invariant left half) ─────────────────────────────────
  { root: 'beli', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // dibelikan
  { root: 'naik', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // dinaikkan
  { root: 'turun', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // diturunkan
  { root: 'bersih', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // dibersihkan
  { root: 'kering', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // dikeringkan
  { root: 'tempat', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // ditempatkan
  { root: 'duduk', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // didudukkan
  { root: 'ambil', affix: 'di-…-kan', illustratesCategory: PASSIVE }, // diambilkan
]
